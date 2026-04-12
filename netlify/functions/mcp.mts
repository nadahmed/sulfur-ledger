import type { Context } from "@netlify/functions";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import * as journalsDb from "../../src/lib/db/journals";
import * as accountsDb from "../../src/lib/db/accounts";
import * as tagsDb from "../../src/lib/db/tags";
import * as recurringDb from "../../src/lib/db/recurring";
import { getOrganization } from "../../src/lib/db/organizations";
import { createMcpActivityLog } from "../../src/lib/db/audit";
import { recordSimplexJournalEntry } from "../../src/lib/ai/journal-shared";
import { z } from "zod";
import { randomUUID } from "crypto";

export default async (req: Request, context: Context) => {
  // 1. Capture Client IP & Device Info
  const ipAddress = req.headers.get("x-nf-client-connection-ip") || 
                    req.headers.get("x-forwarded-for")?.split(",")[0].trim() || 
                    "unknown";
  const userAgent = "MCP Client";

  // 1.1 Authorization Logic (from headers)
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

  // 1.5 Logging Helper
  const logActivity = async (toolName: string, input: any, result: any, error?: string) => {
    try {
      const now = new Date();
      await createMcpActivityLog({
        orgId,
        id: randomUUID(),
        toolName,
        input: JSON.stringify(input),
        status: error ? "error" : "success",
        userName: "AI Agent",
        error,
        timestamp: now.toISOString(),
        ipAddress,
        userAgent
      });
    } catch (e) {
      console.error("Failed to log MCP activity:", e);
    }
  };

  // 2. Initialize MCP Transport and Server
  const transport = new WebStandardStreamableHTTPServerTransport();
  
  const server = new McpServer({
    name: "Sulfur Ledger MCP Server",
    version: "2.0.0"
  }, {
    capabilities: { tools: {}, resources: {} }
  });

  // 2.5 Intercept registerTool to add automatic logging
  const originalRegisterTool = server.registerTool.bind(server);
  server.registerTool = (name: string, schema: any, handler: any) => {
    return originalRegisterTool(
      name,
      schema,
      async (args: any) => {
        try {
          const result = await handler(args);
          await logActivity(name, args, result);
          return result;
        } catch (e: any) {
          await logActivity(name, args, null, e.message);
          throw e;
        }
      }
    );
  };

  // ─── ACCOUNTS ────────────────────────────────────────────────────────────────

  // Tool: List Accounts
  server.registerTool(
    "get_accounts",
    {
      description: "Returns all accounts in the chart of accounts for this organization.",
      inputSchema: {}
    },
    async () => {
      const accs = await accountsDb.getAccounts(orgId);
      const simplifiedAccs = accs.map((a: any) => ({
        id: a.id,
        name: a.name,
        category: a.category,
        status: a.status
      }));
      return { content: [{ type: "text", text: JSON.stringify(simplifiedAccs, null, 2) }] };
    }
  );

  // Tool: Create Account
  server.registerTool(
    "create_account",
    {
      description: "Adds a new account to the chart of accounts.",
      inputSchema: {
        id: z.string().describe("Unique lowercase hyphen-separated ID"),
        name: z.string().describe("Human-readable display name"),
        category: z.enum(["asset", "liability", "equity", "income", "expense"]),
      }
    },
    async ({ id, name, category }) => {
      try {
        const account = { orgId, id, name, category, status: "active" as const, createdAt: new Date().toISOString() };
        await accountsDb.createAccount(account, "mcp-user", "AI Agent", { ipAddress, userAgent });
        return { content: [{ type: "text", text: `Account '${name}' created correctly.` }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  // Tool: Archive Account
  server.registerTool(
    "archive_account",
    {
      description: "Archives an account.",
      inputSchema: { accountId: z.string() }
    },
    async ({ accountId }) => {
      try {
        await accountsDb.archiveAccount(orgId, accountId, "mcp-user", "AI Agent", { ipAddress, userAgent });
        return { content: [{ type: "text", text: `Account '${accountId}' archived.` }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  // ─── TAGS ───────────────────────────────────────────────────────────────────

  // Tool: Create Tag
  server.registerTool(
    "create_tag",
    {
      description: "Creates a new formal tag.",
      inputSchema: {
        name: z.string(),
        color: z.string(),
        description: z.string().optional()
      }
    },
    async (args) => {
      try {
        const tag = await tagsDb.createTag({ orgId, ...args }, "mcp-user", "AI Agent", { ipAddress, userAgent });
        return { content: [{ type: "text", text: `Tag '${tag.name}' created with ID ${tag.id}.` }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  // Tool: Delete Tag
  server.registerTool(
    "delete_tag",
    {
      description: "Deletes a formal tag.",
      inputSchema: { tagId: z.string() }
    },
    async ({ tagId }) => {
      try {
        await tagsDb.deleteTag(orgId, tagId, "mcp-user", "AI Agent", { ipAddress, userAgent });
        return { content: [{ type: "text", text: `Tag ${tagId} deleted.` }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  // ─── JOURNALS ────────────────────────────────────────────────────────────────

  // Tool: Record Journal Entry
  server.registerTool(
    "record_journal_entry",
    {
      description: "Records a single transaction.",
      inputSchema: {
        date: z.string(),
        description: z.string(),
        amount: z.number().positive(),
        fromAccountId: z.string(),
        toAccountId: z.string(),
        tags: z.array(z.string()).optional()
      }
    },
    async ({ date, description, amount, fromAccountId, toAccountId, tags }) => {
      try {
        const res = await recordSimplexJournalEntry({
          orgId, userId: "mcp-user", userName: "AI Agent",
          date, description, amount, fromAccountId, toAccountId, tags,
          ipAddress, userAgent
        });
        return { content: [{ type: "text", text: `✅ Recorded: ${description} (${res.id})` }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  // Tool: Record Bulk Journal Entries
  server.registerTool(
    "record_bulk_journal_entries",
    {
      description: "Records multiple transactions.",
      inputSchema: {
        entries: z.array(z.object({
          date: z.string(),
          description: z.string(),
          amount: z.number().positive(),
          fromAccountId: z.string(),
          toAccountId: z.string(),
          tags: z.array(z.string()).optional()
        }))
      }
    },
    async ({ entries }) => {
      const results: string[] = [];
      const errors: string[] = [];
      for (const entryInput of entries) {
        try {
          const res = await recordSimplexJournalEntry({
            orgId, userId: "mcp-user", userName: "AI Agent",
            date: entryInput.date, description: entryInput.description, amount: entryInput.amount,
            fromAccountId: entryInput.fromAccountId, toAccountId: entryInput.toAccountId, tags: entryInput.tags,
            prefix: "[AI-Bulk]", ipAddress, userAgent
          });
          results.push(`✅ ${entryInput.description} (${res.id})`);
        } catch (e: any) {
          errors.push(`❌ ${entryInput.description}: ${e.message}`);
        }
      }
      return { content: [{ type: "text", text: results.concat(errors).join("\n") }] };
    }
  );

  // Tool: Update Journal Entry
  server.registerTool(
    "update_journal_entry",
    {
      description: "Modifies an entry.",
      inputSchema: {
        id: z.string(),
        oldDate: z.string(),
        description: z.string().optional(),
        tags: z.array(z.string()).optional(),
        amount: z.number().positive().optional(),
        fromAccountId: z.string().optional(),
        toAccountId: z.string().optional(),
      }
    },
    async ({ id, oldDate, description, tags, amount, fromAccountId, toAccountId }) => {
      try {
        const updates: any = {};
        if (description) updates.description = `[AI-Edit] ${description}`;
        if (tags) updates.tags = tags;
        updates.date = oldDate;

        let finalLines: any[] = [];
        if (amount !== undefined) {
          const amountPaisa = Math.round(amount * 100);
          finalLines = [
            { orgId, journalId: id, accountId: toAccountId!, amount: amountPaisa, date: oldDate },
            { orgId, journalId: id, accountId: fromAccountId!, amount: -amountPaisa, date: oldDate }
          ];
        }

        await journalsDb.updateJournalEntry(orgId, id, oldDate, updates, finalLines, "mcp-user", "AI Agent", { ipAddress, userAgent });
        return { content: [{ type: "text", text: `✅ Updated entry ${id}.` }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  // Tool: Delete Journal Entry
  server.registerTool(
    "delete_journal_entry",
    {
      description: "Deletes an entry.",
      inputSchema: { id: z.string(), date: z.string() }
    },
    async ({ id, date }) => {
      try {
        await journalsDb.deleteJournalEntry(orgId, id, date, "mcp-user", "AI Agent", { ipAddress, userAgent });
        return { content: [{ type: "text", text: `Entry ${id} deleted.` }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  // Tool: Create Recurring Entry
  server.registerTool(
    "create_recurring_entry",
    {
      description: "Sets up a recurring transaction.",
      inputSchema: {
        name: z.string(),
        description: z.string(),
        frequency: z.enum(["weekly", "monthly", "yearly"]),
        dayOfMonth: z.number().optional(),
        dayOfWeek: z.number().optional(),
        amount: z.number().positive(),
        fromAccountId: z.string(),
        toAccountId: z.string(),
        tags: z.array(z.string()).optional()
      }
    },
    async (args) => {
      try {
        const id = randomUUID();
        const today = new Date().toISOString().split('T')[0];
        const entry = { orgId, id, ...args, interval: 1, startDate: today, nextProcessDate: today, isActive: true, createdAt: new Date().toISOString() };
        await recurringDb.createRecurringEntry(entry, "mcp-user", "AI Agent", { ipAddress, userAgent });
        return { content: [{ type: "text", text: `Recurring entry '${args.name}' created.` }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  // Tool: Get Canonical Financial Report
  server.registerTool(
    "get_financial_report",
    {
      description: "Fetches full financial reports.",
      inputSchema: {
        reportType: z.enum(["trial-balance", "balance-sheet", "income-statement"]),
        startDate: z.string().optional(),
        endDate: z.string().optional()
      }
    },
    async ({ reportType, startDate, endDate }) => {
      try {
        const { generateReportData } = await import("../../src/lib/reports");
        const report = await generateReportData(orgId, reportType, startDate, endDate) as any;
        return { content: [{ type: "text", text: JSON.stringify(report, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  // 3. Connect as Serverless Function
  try {
    await server.connect(transport);
    return transport.handleRequest(req);
  } catch (error) {
    console.error("MCP Server connection error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
};
