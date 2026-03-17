import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as journalsDb from "./lib/db/journals.js";
import * as accountsDb from "./lib/db/accounts.js";

// Make sure AWS Region is set
process.env.AWS_REGION = process.env.AWS_REGION || "us-east-1";

// For stdio MCP servers, the user's context (Organization) should ideally be passed 
// via standard ENV variables. The AI tool will run this process.
const ORG_ID = process.env.ACTIVE_ORG_ID;

if (!ORG_ID) {
  console.error("ACTIVE_ORG_ID environment variable is required to run the MCP server securely.");
  process.exit(1);
}

const server = new McpServer({
  name: "Simple Ledger MCP",
  version: "1.0.0"
});

// Tool: Query Accounts
server.registerTool(
  "get_accounts",
  {
    description: "Fetch the chart of accounts",
    inputSchema: {}
  },
  async () => {
    const accs = await accountsDb.getAccounts(ORG_ID);
    return {
      content: [{ type: "text", text: JSON.stringify(accs, null, 2) }]
    };
  }
);

// Tool: Query Journal Entries
server.registerTool(
  "get_journals",
  {
    description: "Fetch journal entries for a date range",
    inputSchema: {
      startDate: z.string().optional().describe("YYYY-MM-DD"),
      endDate: z.string().optional().describe("YYYY-MM-DD")
    }
  },
  async ({ startDate, endDate }) => {
    const entries = await journalsDb.getJournalEntries(ORG_ID, startDate, endDate);
    return {
      content: [{ type: "text", text: JSON.stringify(entries, null, 2) }]
    };
  }
);

// Tool: Query Account Balance
server.registerTool(
  "get_account_balance",
  {
    description: "Fetch the balance of a specific account using its ID",
    inputSchema: {
      accountId: z.string()
    }
  },
  async ({ accountId }) => {
    const lines = await journalsDb.getAccountLines(ORG_ID, accountId);
    const balance = lines.reduce((sum, line) => sum + line.amount, 0);
    return {
      content: [{ type: "text", text: `Balance for ${accountId} is ${balance} cents.` }]
    };
  }
);

// Tool: Draft Journal Entry
server.registerTool(
  "record_journal_entry",
  {
    description: "Record a new double-entry journal transaction. MUST balance to zero. Amounts in cents.",
    inputSchema: {
      date: z.string().describe("YYYY-MM-DD"),
      description: z.string(),
      lines: z.array(z.object({
        accountId: z.string(),
        amount: z.number().describe("Amount in cents. Positive for debit, negative for credit.")
      }))
    }
  },
  async ({ date, description, lines }) => {
    try {
      const parsedLines = lines.map(l => ({
        orgId: ORG_ID,
        journalId: "mcp-draft", // Replaced below
        accountId: l.accountId,
        amount: l.amount,
        date
      }));

      // A hack to inject UUID and proper mapping
      const { randomUUID } = require("crypto");
      const id = randomUUID();
      parsedLines.forEach(l => l.journalId = id);

      const entry = {
        orgId: ORG_ID,
        id,
        date,
        description: `[AI] ${description}`,
        createdAt: new Date().toISOString()
      };

      await journalsDb.createJournalEntry(entry, parsedLines);

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

// Start server
async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

run().catch(console.error);
