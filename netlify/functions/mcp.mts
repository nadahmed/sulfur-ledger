import type { Context } from "@netlify/functions";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { getOrganization, getApiKey } from "../../src/lib/db/organizations";
import { createMcpActivityLog } from "../../src/lib/db/audit";
import { getChatHistory } from "../../src/lib/db/ai";
import { processChatTurn } from "../../src/lib/ai/chat-service";
import { z } from "zod";
import { randomUUID } from "crypto";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Derive the canonical base URL from the request, works in both dev and production. */
function deriveBaseUrl(req: Request): string {
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

/** Parse the MCP key: expected format is mcp_<orgId>_<secret> where orgId is a UUID. */
function parseMcpKey(apiKey: string): { orgId: string } | null {
  // Key format: mcp_<uuid>_<hex-secret>
  // UUID contains hyphens but no underscores, so we split on the FIRST and SECOND underscore only.
  const firstUnderscore = apiKey.indexOf("_");
  if (firstUnderscore === -1 || apiKey.slice(0, firstUnderscore) !== "mcp") return null;

  const rest = apiKey.slice(firstUnderscore + 1); // "<uuid>_<secret>"
  const secondUnderscore = rest.indexOf("_");
  if (secondUnderscore === -1) return null;

  const orgId = rest.slice(0, secondUnderscore);
  if (!orgId) return null;

  return { orgId };
}

/** Return a 401 Response with a plain-text message. */
const unauthorized = (msg: string) =>
  new Response(`Unauthorized: ${msg}`, { status: 401 });

// ─── Netlify Function Handler ─────────────────────────────────────────────────

export default async (req: Request, _context: Context) => {
  // 1. Read client metadata
  const ipAddress =
    req.headers.get("x-nf-client-connection-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    "unknown";
  const userAgent = req.headers.get("user-agent") || "MCP Client";

  // 2. Validate API key presence and format
  const rawKey = req.headers.get("x-mcp-key");
  if (!rawKey) return unauthorized("Missing x-mcp-key header");

  const parsed = parseMcpKey(rawKey);
  if (!parsed) return unauthorized("Invalid API Key format");

  const { orgId } = parsed;

  // 3. Parallel DB lookups — fetch org + key record at the same time
  const [org, keyRecord] = await Promise.all([
    getOrganization(orgId),
    getApiKey(orgId, rawKey),
  ]);

  if (!org) return unauthorized("Organization not found");

  // 4. Key validation — accept multi-key records OR legacy single-key fallback
  const isLegacyKey = !keyRecord && org.mcpApiKey === rawKey;
  if (!keyRecord && !isLegacyKey) return unauthorized("Invalid API Key");

  // 5. Expiry check
  const expiresAt = keyRecord?.expiresAt ?? org.mcpApiKeyExpiresAt;
  if (expiresAt && new Date(expiresAt) < new Date()) {
    return unauthorized("API Key expired");
  }

  // 6. Resolve identity and permissions from key record (or org owner for legacy keys)
  const userId   = keyRecord?.userId   || `legacy:${orgId}`;
  const userName = keyRecord?.name     || "AI Agent";
  const role     = keyRecord?.role     || "admin";
  
  // API Keys are organizational service accounts and NEVER count as "Owners" 
  // for permission bypass purposes.
  const isOwner  = false;
  const keyLabel = keyRecord?.name     || "legacy-key";

  // 7. Activity logging helper (non-blocking, fire-and-forget)
  const logActivity = (toolName: string, input: any, result: any, error?: string) => {
    createMcpActivityLog({
      orgId,
      id: randomUUID(),
      toolName,
      input: JSON.stringify(input),
      status: error ? "error" : "success",
      userName: `${userName} [${keyLabel}]`,
      error,
      timestamp: new Date().toISOString(),
      ipAddress,
      userAgent,
    }).catch((e) => console.error("[MCP] Failed to log activity:", e));
  };

  // 8. Build MCP server
  const transport = new WebStandardStreamableHTTPServerTransport();

  const server = new McpServer(
    { name: "Sulfur Ledger MCP Server", version: "2.0.0" },
    { capabilities: { tools: {}, resources: {} } }
  );

  // Wrap registerTool to add auto-logging for every tool
  const _registerTool = server.registerTool.bind(server);
  server.registerTool = (name: string, schema: any, handler: any) =>
    _registerTool(name, schema, async (args: any) => {
      try {
        const result = await handler(args);
        logActivity(name, args, result);
        return result;
      } catch (e: any) {
        logActivity(name, args, null, e.message);
        throw e;
      }
    });

  // ─── Tool: query_assistant ──────────────────────────────────────────────────
  server.registerTool(
    "query_assistant",
    {
      description:
        "Converse with Sulfur, your expert CFO assistant. You can ask for reports, " +
        "perform transactions, manage accounts, or get financial advice. " +
        "State your request in plain natural language.",
      inputSchema: z.object({
        prompt: z.string().describe("The user's request or message"),
      }),
    },
    async ({ prompt }: { prompt: string }) => {
      try {
        // Load recent history for cross-platform context (chronological order)
        const historyData = await getChatHistory(orgId, 15);
        const messages: { role: "user" | "assistant"; content: string }[] = [
          ...historyData.map((m) => ({ role: m.role, content: m.content })),
          { role: "user", content: prompt },
        ];

        const result = await processChatTurn({
          org,
          messages,
          userId,
          userName,
          role,
          isOwner,
          localTime: new Date().toLocaleString(),
          fullBaseUrl: deriveBaseUrl(req),
          ipAddress,
          userAgent,
        });

        if (!result) throw new Error("Assistant failed to generate a response.");

        return { content: [{ type: "text" as const, text: result.content }] };
      } catch (e: any) {
        return {
          content: [{ type: "text" as const, text: `Error: ${e.message}` }],
          isError: true,
        };
      }
    }
  );
  // ─── End Tools ─────────────────────────────────────────────────────────────

  // 9. Connect and serve
  try {
    await server.connect(transport);
    return transport.handleRequest(req);
  } catch (error) {
    console.error("[MCP] Server connection error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
};

export const config = {
  path: "/api/mcp",
};