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

  // Tool: Create Account
  server.tool(
    "create_account",
    "Add a new account to the chart of accounts.",
    {
      id: z.string().describe("Unique lowercase ID, e.g. 'checking-main'"),
      name: z.string().describe("Display name, e.g. 'Main Checking Account'"),
      category: z.enum(["asset", "liability", "equity", "income", "expense"]),
    },
    async ({ id, name, category }) => {
      try {
        const account = {
          orgId,
          id,
          name,
          category,
          status: "active" as const,
          createdAt: new Date().toISOString()
        };
        await accountsDb.createAccount(account);
        return {
          content: [{ type: "text", text: `Account '${name}' (${id}) created successfully.` }]
        };
      } catch (e: any) {
        return {
          content: [{ type: "text", text: `Error creating account: ${e.message}` }],
          isError: true
        };
      }
    }
  );

  // Tool: Archive Account
  server.tool(
    "archive_account",
    "Archive an account to prevent new transactions.",
    {
      accountId: z.string()
    },
    async ({ accountId }) => {
      try {
        await accountsDb.archiveAccount(orgId, accountId);
        return {
          content: [{ type: "text", text: `Account ${accountId} archived successfully.` }]
        };
      } catch (e: any) {
        return {
          content: [{ type: "text", text: `Error archiving account: ${e.message}` }],
          isError: true
        };
      }
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
        tags: e.tags,
        lines: (e.lines || []).map((l: any) => ({
          accountId: l.accountId,
          amount: l.amount / 100
        }))
      }));
      return {
        content: [{ type: "text", text: JSON.stringify(simplifiedEntries, null, 2) }]
      };
    }
  );

  // Tool: Search Journals by Tag
  server.tool(
    "search_journals_by_tag",
    "Filter journal entries by specific tags.",
    {
      tags: z.array(z.string()).describe("Tags to filter by"),
      startDate: z.string().optional().describe("YYYY-MM-DD"),
      endDate: z.string().optional().describe("YYYY-MM-DD")
    },
    async ({ tags, startDate, endDate }) => {
      const entries = await journalsDb.getJournalEntries(orgId, startDate, endDate);
      const filtered = entries.filter(e => 
        e.tags && tags.some(t => e.tags!.includes(t))
      );
      const simplified = filtered.map((e: any) => ({
        id: e.id,
        date: e.date,
        description: e.description,
        tags: e.tags,
        lines: (e.lines || []).map((l: any) => ({ accountId: l.accountId, amount: l.amount / 100 }))
      }));
      return {
        content: [{ type: "text", text: JSON.stringify(simplified, null, 2) }]
      };
    }
  );

  // Tool: Query Account Balance
  server.tool(
    "get_account_balance",
    "Fetch the balance of a specific account using its ID, with optional date filtering.",
    {
      accountId: z.string(),
      startDate: z.string().optional().describe("Start date (YYYY-MM-DD)"),
      endDate: z.string().optional().describe("End date (YYYY-MM-DD)")
    },
    async ({ accountId, startDate, endDate }) => {
      const lines = await journalsDb.getAccountLines(orgId, accountId, startDate, endDate);
      const balancePaisa = lines.reduce((sum, line) => sum + line.amount, 0);
      const balance = balancePaisa / 100;
      let periodStr = "";
      if (startDate && endDate) periodStr = ` from ${startDate} to ${endDate}`;
      else if (startDate) periodStr = ` since ${startDate}`;
      else if (endDate) periodStr = ` until ${endDate}`;
      
      return {
        content: [{ type: "text", text: `Balance for ${accountId}${periodStr} is ${balance} Taka.` }]
      };
    }
  );

  // Tool: Get Financial Summary
  server.tool(
    "get_financial_summary",
    "Get a high-level summary of total Income vs Expenses for a period.",
    {
      startDate: z.string().optional().describe("YYYY-MM-DD"),
      endDate: z.string().optional().describe("YYYY-MM-DD")
    },
    async ({ startDate, endDate }) => {
      const [accs, entries] = await Promise.all([
        accountsDb.getAccounts(orgId),
        journalsDb.getJournalEntries(orgId, startDate, endDate)
      ]);

      const catMap = new Map(accs.map(a => [a.id, a.category]));
      
      let totalIncome = 0;
      let totalExpenses = 0;

      for (const entry of entries) {
        // Fetch lines for this entry using getAccountLines or getting them all as usual
        // Actually getJournalEntriesWithLines is better if we want to fetch batches
        const { data } = await journalsDb.getJournalEntriesWithLines(orgId, 1, undefined, entry.date.slice(0, 10));
        const detailedEntry = data.find(d => d.id === entry.id);
        if (!detailedEntry) continue;

        for (const line of detailedEntry.lines) {
          const cat = catMap.get(line.accountId);
          if (cat === "income") {
            totalIncome -= line.amount;
          } else if (cat === "expense") {
            totalExpenses += line.amount;
          }
        }
      }

      return {
        content: [{ 
          type: "text", 
          text: `Summary for ${startDate || 'beginning'} to ${endDate || 'now'}:\n` +
                `- Total Income: ${totalIncome / 100} Taka\n` +
                `- Total Expenses: ${totalExpenses / 100} Taka\n` +
                `- Net Profit/Loss: ${(totalIncome - totalExpenses) / 100} Taka`
        }]
      };
    }
  );

  // Tool: Get Account History
  server.tool(
    "get_account_history",
    "Fetch transaction history and running balance for a specific account.",
    {
      accountId: z.string(),
      startDate: z.string().optional().describe("YYYY-MM-DD"),
      endDate: z.string().optional().describe("YYYY-MM-DD")
    },
    async ({ accountId, startDate, endDate }) => {
      const lines = await journalsDb.getAccountLines(orgId, accountId, startDate, endDate);
      let runningBalancePaisa = 0;
      const history = lines.map(l => {
        runningBalancePaisa += l.amount;
        return {
          date: l.date,
          journalId: l.journalId,
          amount: l.amount / 100,
          runningBalance: runningBalancePaisa / 100
        };
      });
      return {
        content: [{ type: "text", text: JSON.stringify(history, null, 2) }]
      };
    }
  );

  // Tool: Record Journal Entry
  server.tool(
    "record_journal_entry",
    "Record a new double-entry journal transaction. MUST balance to zero. Amounts in Taka. Supports time for sequencing.",
    {
      date: z.string().describe("Date (YYYY-MM-DD or full ISO 8601 string)"),
      time: z.string().optional().describe("Optional time (HH:mm) if date is YYYY-MM-DD"),
      description: z.string(),
      tags: z.array(z.string()).optional(),
      lines: z.array(z.object({
        accountId: z.string(),
        amount: z.number().describe("Amount in Taka. Positive for debit, negative for credit.")
      }))
    },
    async ({ date: dateInput, time, description, tags, lines }) => {
      try {
        let finalDate = dateInput;
        if (dateInput.length === 10) { // YYYY-MM-DD
          const timePart = time || new Date().toISOString().slice(11, 19); // Use provided time or current time
          finalDate = `${dateInput}T${timePart}Z`;
        }

        const { randomUUID } = require("crypto");
        const id = randomUUID();
        
        const parsedLines = lines.map((l: any) => ({
          orgId,
          journalId: id,
          accountId: l.accountId,
          amount: Math.round(l.amount * 100),
          date: finalDate
        }));

        const entry = {
          orgId,
          id,
          date: finalDate,
          description: `[AI] ${description}`,
          tags,
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

  // Tool: Record Bulk Journal Entries
  server.tool(
    "record_bulk_journal_entries",
    "Record multiple journal entries in a single call. Each entry must balance to zero. Amounts in Taka.",
    {
      entries: z.array(z.object({
        date: z.string().describe("Date (YYYY-MM-DD or full ISO 8601 string)"),
        time: z.string().optional().describe("Optional time (HH:mm)"),
        description: z.string(),
        tags: z.array(z.string()).optional(),
        lines: z.array(z.object({
          accountId: z.string(),
          amount: z.number().describe("Amount in Taka. Positive for debit, negative for credit.")
        }))
      }))
    },
    async ({ entries }) => {
      const results: string[] = [];
      const errors: string[] = [];
      
      for (const entryInput of entries) {
        try {
          let finalDate = entryInput.date;
          if (entryInput.date.length === 10) {
             const timePart = entryInput.time || new Date().toISOString().slice(11, 19);
             finalDate = `${entryInput.date}T${timePart}Z`;
          }

          const { randomUUID } = require("crypto");
          const id = randomUUID();
          
          const parsedLines = entryInput.lines.map((l: any) => ({
            orgId,
            journalId: id,
            accountId: l.accountId,
            amount: Math.round(l.amount * 100),
            date: finalDate
          }));

          const entry = {
            orgId,
            id,
            date: finalDate,
            description: `[AI-Bulk] ${entryInput.description}`,
            tags: entryInput.tags,
            createdAt: new Date().toISOString()
          };

          await journalsDb.createJournalEntry(entry, parsedLines, "mcp-user");
          results.push(`Success: ${entryInput.description} (${id})`);
        } catch (e: any) {
          errors.push(`Error in "${entryInput.description}": ${e.message}`);
        }
      }

      const summary = [
        `Processed ${entries.length} entries.`,
        ...results,
        ...(errors.length > 0 ? ["Errors:", ...errors] : [])
      ].join("\n");

      return {
        content: [{ type: "text", text: summary }],
        isError: errors.length > 0 && results.length === 0
      };
    }
  );

  // Tool: Update Journal Entry
  server.tool(
    "update_journal_entry",
    "Modify an existing journal entry. Caution: replacing all lines with provided ones.",
    {
      id: z.string().describe("Entry ID"),
      oldDate: z.string().describe("Current date of the entry for lookup (ISO string)"),
      description: z.string().optional(),
      notes: z.string().optional(),
      tags: z.array(z.string()).optional(),
      lines: z.array(z.object({
        accountId: z.string(),
        amount: z.number().describe("Amount in Taka")
      })).optional()
    },
    async ({ id, oldDate, description, notes, tags, lines }) => {
      try {
        const updates: any = {};
        if (description) updates.description = `[AI-Edit] ${description}`;
        if (notes) updates.notes = notes;
        if (tags) updates.tags = tags;
        if (oldDate) updates.date = oldDate; // Default to old if not changing

        let finalLines: any[] = [];
        if (lines) {
          finalLines = lines.map(l => ({
            orgId,
            journalId: id,
            accountId: l.accountId,
            amount: Math.round(l.amount * 100),
            date: oldDate
          }));
        } else {
           return { content: [{ type: "text", text: "Error: lines must be provided for full replacement." }], isError: true };
        }

        await journalsDb.updateJournalEntry(orgId, id, oldDate, updates, finalLines, "mcp-user");
        return {
          content: [{ type: "text", text: `Journal entry ${id} updated successfully.` }]
        };
      } catch (e: any) {
        return {
          content: [{ type: "text", text: `Error updating entry: ${e.message}` }],
          isError: true
        };
      }
    }
  );

  // Tool: Delete Journal Entry
  server.tool(
    "delete_journal_entry",
    "Permanently remove a journal entry.",
    {
      id: z.string(),
      date: z.string().describe("Date of entry for lookup")
    },
    async ({ id, date }) => {
      try {
        await journalsDb.deleteJournalEntry(orgId, id, date, "mcp-user");
        return {
          content: [{ type: "text", text: `Journal entry ${id} deleted.` }]
        };
      } catch (e: any) {
        return {
          content: [{ type: "text", text: `Error deleting entry: ${e.message}` }],
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
