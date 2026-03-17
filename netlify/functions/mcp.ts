import type { Context } from "@netlify/functions";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import * as journalsDb from "../../src/lib/db/journals";
import * as accountsDb from "../../src/lib/db/accounts";
import { getOrganization } from "../../src/lib/db/organizations";
import { z } from "zod";

export default async (req: Request, context: Context) => {
  // 1. Authorization Logic (from headers)
  const apiKey = req.headers.get("x-mcp-key");
  
  if (!apiKey) {
    return new Response("Unauthorized: Missing x-mcp-key header", { status: 401 });
  }

  // Derive orgId from key: mcp_${orgId}_${secret}
  const parts = apiKey.split('_');
  if (parts.length < 3 || parts[0] !== 'mcp') {
    return new Response("Unauthorized: Invalid API Key format", { status: 401 });
  }
  
  const orgId = parts[1];
  const org = await getOrganization(orgId);
  
  if (!org || org.mcpApiKey !== apiKey) {
    return new Response("Unauthorized: Invalid API Key or Organization", { status: 401 });
  }

  // Check TTL
  if (org.mcpApiKeyExpiresAt && new Date(org.mcpApiKeyExpiresAt) < new Date()) {
    return new Response("Unauthorized: API Key expired", { status: 401 });
  }

  // 2. Initialize MCP Transport and Server
  // Using Web Standard variant because Netlify Functions (v2 Edge) use Web Request/Response APIs
  const transport = new WebStandardStreamableHTTPServerTransport();
  
  const server = new McpServer({
    name: "Netlify MCP Server for Sulfur Ledger",
    version: "1.1.0"
  }, {
    capabilities: { tools: {}, resources: {} }
  });

  // 3. Register Ledger Tools
  
  // Tool: Query Accounts
  server.tool(
    "get_accounts",
    "Fetch the chart of accounts",
    {},
    async () => {
      const accs = await accountsDb.getAccounts(orgId);
      const simplifiedAccs = accs.map((a: any) => ({
        id: a.id,
        name: a.name,
        category: a.category,
        status: a.status
      }));
      return {
        content: [{ type: "text", text: JSON.stringify(simplifiedAccs, null, 2) }]
      };
    }
  );

  // Tool: Query Journal Entries
  server.tool(
    "get_journals",
    "Fetch journal entries for a date range",
    {
      startDate: z.string().optional().describe("YYYY-MM-DD"),
      endDate: z.string().optional().describe("YYYY-MM-DD")
    },
    async ({ startDate, endDate }) => {
      const entries = await journalsDb.getJournalEntries(orgId, startDate, endDate);
      const simplifiedEntries = entries.map((e: any) => ({
        id: e.id,
        date: e.date,
        description: e.description,
        lines: (e.lines || []).map((l: any) => ({
          accountId: l.accountId,
          amount: l.amount
        }))
      }));
      return {
        content: [{ type: "text", text: JSON.stringify(simplifiedEntries, null, 2) }]
      };
    }
  );

  // Tool: Query Account Balance
  server.tool(
    "get_account_balance",
    "Fetch the balance of a specific account using its ID",
    {
      accountId: z.string()
    },
    async ({ accountId }) => {
      const lines = await journalsDb.getAccountLines(orgId, accountId);
      const balance = lines.reduce((sum, line) => sum + line.amount, 0);
      return {
        content: [{ type: "text", text: `Balance for ${accountId} is ${balance} cents.` }]
      };
    }
  );

  // Tool: Record Journal Entry
  server.tool(
    "record_journal_entry",
    "Record a new double-entry journal transaction. MUST balance to zero. Amounts in cents.",
    {
      date: z.string().describe("YYYY-MM-DD"),
      description: z.string(),
      lines: z.array(z.object({
        accountId: z.string(),
        amount: z.number().describe("Amount in cents. Positive for debit, negative for credit.")
      }))
    },
    async ({ date, description, lines }) => {
      try {
        const { randomUUID } = require("crypto");
        const id = randomUUID();
        
        const parsedLines = lines.map((l: any) => ({
          orgId,
          journalId: id,
          accountId: l.accountId,
          amount: l.amount,
          date
        }));

        const entry = {
          orgId,
          id,
          date,
          description: `[AI] ${description}`,
          createdAt: new Date().toISOString()
        };

        await journalsDb.createJournalEntry(entry, parsedLines, "mcp-user");

        return {
          content: [{ type: "text", text: `Journal entry recorded successfully with ID: ${id}` }]
        };
      } catch (e: any) {
        return {
          content: [{ type: "text", text: `Error recording entry: ${e.message}` }],
          isError: true
        };
      }
    }
  );

  // 4. Connect Server to Transport
  await server.connect(transport);
  
  // 5. Delegate request handling to the transport which returns a Response object
  return await transport.handleRequest(req);
};

export const config = {
  path: "/api/mcp"
};
