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
      description: `Returns all accounts in the chart of accounts for this organization.

ALWAYS call this tool FIRST before:
- Recording any journal entry (to verify account IDs exist and are active)
- Creating a new account (to check whether a suitable account already exists)
- Fetching balances or history (to find the correct account ID)

Response fields per account:
- id: the unique identifier used in all other tools
- name: human-readable display name
- category: one of asset | liability | equity | income | expense
- status: "active" or "archived" — NEVER use archived accounts in journal entries`,
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
      return {
        content: [{ type: "text", text: JSON.stringify(simplifiedAccs, null, 2) }]
      };
    }
  );

  // Tool: Create Account
  server.registerTool(
    "create_account",
    {
      description: `Adds a new account to the chart of accounts.

WORKFLOW — always call get_accounts first to check existing accounts, then use judgment:

IF the requested account is clearly novel and no existing account covers the same purpose:
  → Proceed directly with create_account. No need to ask for confirmation.

IF there is reasonable doubt — e.g. an existing account has a similar name, overlapping category,
or could plausibly serve the same purpose:
  → Pause and present the similar accounts to the user.
  → Ask: "Would you like to use one of these existing accounts, or create a new one?"
  → Only proceed with create_account once the user confirms.

Examples of "reasonable doubt":
- User asks for "office supplies expense" and "supplies-expense" already exists
- User asks for "business checking" and "checking-main" already exists
- User asks for "revenue" and there are multiple income accounts already

Examples of NO doubt (proceed directly):
- User explicitly says "create a new account called X"
- The chart of accounts has nothing in the same category or with a similar purpose
- The account type is clearly distinct (e.g. adding a new bank account category)

DOs:
- Use lowercase, hyphen-separated IDs (e.g. "checking-main", "salary-income")
- Match the correct category: asset (what you own), liability (what you owe), equity (net worth), income (revenue), expense (costs)
- Use clear, descriptive names

DON'Ts:
- Never create an account with an ID that already exists
- Never create a near-duplicate account without flagging it to the user`,
      inputSchema: {
        id: z.string().describe("Unique lowercase hyphen-separated ID, e.g. 'checking-main'"),
        name: z.string().describe("Human-readable display name, e.g. 'Main Checking Account'"),
        category: z.enum(["asset", "liability", "equity", "income", "expense"]).describe(
          "Account category: asset (things owned), liability (things owed), equity (net worth), income (revenue), expense (costs)"
        ),
      }
    },
    async ({ id, name, category }) => {
      try {
        // Check for existing account with same id
        const existing = await accountsDb.getAccounts(orgId);
        const duplicate = existing.find((a: any) => a.id === id);
        if (duplicate) {
          return {
            content: [{ type: "text", text: `Error: An account with ID '${id}' already exists (name: "${duplicate.name}", category: ${duplicate.category}). Use a different ID or use the existing account.` }],
            isError: true
          };
        }

        const account = {
          orgId,
          id,
          name,
          category,
          status: "active" as const,
          createdAt: new Date().toISOString()
        };
        await accountsDb.createAccount(account, "mcp-user", "AI Agent");
        return {
          content: [{ type: "text", text: `Account '${name}' (id: ${id}, category: ${category}) created successfully.` }]
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
  server.registerTool(
    "archive_account",
    {
      description: `Archives an account so it can no longer be used in new journal entries.

⚠️ WARNING: This is a significant action.
- Archived accounts still appear in historical reports and balances
- You cannot post new journal entries to an archived account
- Always confirm with the user before archiving

DOs:
- Call get_accounts first to confirm the account exists and is currently active
- Inform the user what impact archiving will have

DON'Ts:
- Never archive an account without explicit user confirmation
- Never archive accounts that have recent or ongoing transactions without warning the user`,
      inputSchema: {
        accountId: z.string().describe("The ID of the account to archive")
      }
    },
    async ({ accountId }) => {
      try {
        await accountsDb.archiveAccount(orgId, accountId, "mcp-user", "AI Agent");
        return {
          content: [{ type: "text", text: `Account '${accountId}' has been archived. It will no longer accept new transactions.` }]
        };
      } catch (e: any) {
        return {
          content: [{ type: "text", text: `Error archiving account: ${e.message}` }],
          isError: true
        };
      }
    }
  );

  // ─── TAGS ───────────────────────────────────────────────────────────────────

  // Tool: List Tags
  server.registerTool(
    "get_tags",
    {
      description: "Returns all formal tags for this organization. Tags have names, colors, and IDs.",
      inputSchema: {}
    },
    async () => {
      const tags = await tagsDb.getTags(orgId);
      return {
        content: [{ type: "text", text: JSON.stringify(tags, null, 2) }]
      };
    }
  );

  // Tool: Create Tag
  server.registerTool(
    "create_tag",
    {
      description: `Creates a new formal tag with a name and color.

⚠️ MANDATORY WORKFLOW:
- ALWAYS call get_tags first to check if a suitable tag already exists.
- NEVER create a tag automatically without presenting the proposed name and color to the user.
- Suggest similar existing tags if you find a close match (e.g., 'Marketing-2024' vs 'Marketing').
- Only call this tool once the user has explicitly confirmed the new tag creation.`,
      inputSchema: {
        name: z.string().describe("Tag name, e.g. 'Project Alpha'"),
        color: z.string().describe("CSS color hex code or name, e.g. '#2563eb' or 'blue'"),
        description: z.string().optional().describe("Optional description of the tag's purpose")
      }
    },
    async (args) => {
      try {
        const tag = await tagsDb.createTag({ orgId, ...args });
        return {
          content: [{ type: "text", text: `Tag '${tag.name}' created with ID ${tag.id}.` }]
        };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  // Tool: Delete Tag
  server.registerTool(
    "delete_tag",
    {
      description: "Deletes a formal tag. NOTE: This does not remove it from existing transactions.",
      inputSchema: {
        tagId: z.string().describe("The ID of the tag to delete")
      }
    },
    async ({ tagId }) => {
      try {
        await tagsDb.deleteTag(orgId, tagId);
        return { content: [{ type: "text", text: `Tag ${tagId} deleted.` }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  // ─── JOURNALS ────────────────────────────────────────────────────────────────

  // Tool: Get Journal Entries
  server.registerTool(
    "get_journals",
    {
      description: `Fetches journal entries, optionally filtered by date range.

Use this to:
- Review recent transactions
- Check what has already been recorded before adding new entries
- Pull data for user review or reporting

Response fields per entry:
- id: unique entry identifier (needed for update/delete)
- date: ISO 8601 datetime string
- description: transaction description (AI-created entries are prefixed with [AI] or [AI-Bulk])
- tags: optional array of tag strings for grouping
- lines: array of {accountId, amount} where amount is in Taka (positive = debit, negative = credit)

DOs:
- Always specify a date range when possible to limit data volume
- Use this before recording entries to avoid duplicates

DON'Ts:
- Do not call without any filters for large datasets (performance)`,
      inputSchema: {
        startDate: z.string().optional().describe("Start date filter in YYYY-MM-DD format (inclusive)"),
        endDate: z.string().optional().describe("End date filter in YYYY-MM-DD format (inclusive)"),
        tagIds: z.array(z.string()).optional().describe("Filter by one or more tag IDs")
      }
    },
    async ({ startDate, endDate, tagIds }) => {
      const entries = await journalsDb.getJournalEntries(orgId, startDate, endDate, tagIds);
      
      // Fetch lines for all entries in parallel
      const enrichedEntries = await Promise.all(entries.map(async (e) => {
        const lines = await journalsDb.getJournalLinesForJournal(orgId, e.id);
        return { ...e, lines };
      }));

      const simplifiedEntries = enrichedEntries.map((e: any) => ({
        id: e.id,
        date: e.date.slice(0, 10),
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
  server.registerTool(
    "search_journals_by_tag",
    {
      description: `Filters journal entries that contain at least one of the specified tags.

Use this to:
- Pull all transactions for a specific category (e.g. "marketing", "payroll")
- Generate tag-based expense reports
- Find related transactions grouped by purpose

DOs:
- Combine with startDate/endDate for focused reports
- Tags are case-sensitive; use get_journals first to see what tags exist

DON'Ts:
- Don't use this as a substitute for get_financial_summary for P&L reporting`,
      inputSchema: {
        tags: z.array(z.string()).describe("List of tags to filter by — entries matching ANY tag are returned"),
        startDate: z.string().optional().describe("Start date filter YYYY-MM-DD"),
        endDate: z.string().optional().describe("End date filter YYYY-MM-DD")
      }
    },
    async ({ tags, startDate, endDate }) => {
      const entries = await journalsDb.getJournalEntries(orgId, startDate, endDate);
      const filtered = entries.filter(e => 
        e.tags && tags.some(t => e.tags!.includes(t))
      );

      // Fetch lines for filtered entries
      const enriched = await Promise.all(filtered.map(async (e) => {
        const lines = await journalsDb.getJournalLinesForJournal(orgId, e.id);
        return { ...e, lines };
      }));

      const simplified = enriched.map((e: any) => ({
        id: e.id,
        date: e.date.slice(0, 10),
        description: e.description,
        tags: e.tags,
        lines: (e.lines || []).map((l: any) => ({ accountId: l.accountId, amount: l.amount / 100 }))
      }));
      return {
        content: [{ type: "text", text: JSON.stringify(simplified, null, 2) }]
      };
    }
  );

  // Tool: Get Account Balance
  server.registerTool(
    "get_account_balance",
    {
      description: `Returns the net balance of a specific account, with optional date filtering.

The balance is computed as the sum of all line amounts (in Taka) for the account within the date range.

DOs:
- Call get_accounts first to get the correct account ID
- Use startDate + endDate for period-specific balances (e.g. monthly)
- Use for asset/liability accounts to see current balances

DON'Ts:
- Don't use this alone to calculate profit/loss — use get_financial_summary for P&L
- Don't use archived account IDs`,
      inputSchema: {
        accountId: z.string().describe("The account ID to query (get valid IDs from get_accounts)"),
        startDate: z.string().optional().describe("Start date YYYY-MM-DD"),
        endDate: z.string().optional().describe("End date YYYY-MM-DD")
      }
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
        content: [{ type: "text", text: `Balance for account '${accountId}'${periodStr}: ${balance.toFixed(2)} Taka` }]
      };
    }
  );

  // Tool: Get Financial Summary (P&L)
  server.registerTool(
    "get_financial_summary",
    {
      description: `Returns a high-level Profit & Loss summary: total Income vs. total Expenses and Net Profit/Loss for a period.

Use this for:
- Monthly/annual P&L summaries
- Answering "how much did we make/spend this period?"
- Quick financial health checks

Response includes:
- Total Income (Taka): sum of all income account credits
- Total Expenses (Taka): sum of all expense account debits
- Net Profit/Loss (Taka): Income minus Expenses (positive = profit, negative = loss)

DOs:
- Always specify a date range for meaningful period reports
- Use alongside get_accounts to understand account categories

DON'Ts:
- Do not use for balance sheet figures — this is only P&L`,
      inputSchema: {
        startDate: z.string().optional().describe("Start date YYYY-MM-DD"),
        endDate: z.string().optional().describe("End date YYYY-MM-DD")
      }
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
        const lines = await journalsDb.getJournalLinesForJournal(orgId, entry.id);

        for (const line of lines) {
          const cat = catMap.get(line.accountId);
          if (cat === "income") {
            totalIncome -= line.amount;
          } else if (cat === "expense") {
            totalExpenses += line.amount;
          }
        }
      }

      const net = totalIncome - totalExpenses;
      const period = `${startDate || 'beginning'} to ${endDate || 'now'}`;
      
      return {
        content: [{ 
          type: "text", 
          text: `P&L Summary (${period}):\n` +
                `  Total Income:   ${(totalIncome / 100).toFixed(2)} Taka\n` +
                `  Total Expenses: ${(totalExpenses / 100).toFixed(2)} Taka\n` +
                `  Net ${net >= 0 ? 'Profit' : 'Loss'}:  ${(Math.abs(net) / 100).toFixed(2)} Taka`
        }]
      };
    }
  );

  // Tool: Get Account History (running balance)
  server.registerTool(
    "get_account_history",
    {
      description: `Returns a chronological list of transactions for an account with a running balance.

Use this for:
- Bank account reconciliation
- Detailed transaction review for a specific account
- Seeing how and when an account balance changed

Response per transaction:
- date: transaction datetime
- journalId: the journal entry this line belongs to
- amount: line amount in Taka (positive = debit, negative = credit)
- runningBalance: cumulative balance after this transaction

DOs:
- Call get_accounts first to confirm the account ID
- Use date filters to limit output for accounts with many transactions`,
      inputSchema: {
        accountId: z.string().describe("Account ID to fetch history for"),
        startDate: z.string().optional().describe("Start date YYYY-MM-DD"),
        endDate: z.string().optional().describe("End date YYYY-MM-DD")
      }
    },
    async ({ accountId, startDate, endDate }) => {
      const lines = await journalsDb.getAccountLines(orgId, accountId, startDate, endDate);
      let runningBalancePaisa = 0;
      const history = lines.map(l => {
        runningBalancePaisa += l.amount;
        return {
          date: l.date.slice(0, 10),
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

  // Tool: Record Journal Entry (simplified)
  server.registerTool(
    "record_journal_entry",
    {
      description: `Records a single financial transaction as a double-entry journal entry.

SIMPLIFIED INTERFACE — you do NOT need to specify debit/credit lines. Just provide:
  - fromAccountId: the account money comes FROM (will be credited / reduced)
  - toAccountId: the account money goes TO (will be debited / increased)
  - amount: the positive transaction amount in Taka (e.g. 500.00)

MANDATORY WORKFLOW before calling this tool:
1. Call get_accounts to get valid account IDs and confirm they are "active"
2. Confirm with the user which accounts to use
3. If a suitable account doesn't exist, follow the create_account workflow first
4. Call get_tags to verify which tags exist — NEVER guess or create tags automatically

DOs:
- amount MUST be positive and greater than 0 (e.g. 150.75)
- Use descriptive descriptions — they appear in reports
- **TAGS**: Only existing Tag IDs or Names are allowed (e.g., 'marketing', 'payroll'). Free text tags will be REJECTED.
- Add tags to group related transactions (e.g. "payroll", "marketing", "rent")
- Provide a date in YYYY-MM-DD format; optionally add time HH:mm for ordering

DON'Ts:
- Never use the same account for both fromAccountId and toAccountId
- Never use archived accounts
- Never record entries without confirming the accounts with the user first
- Never use new or inferred tags without explicit user approval via the create_tag workflow
- Do not record duplicate entries — check get_journals if unsure`,
      inputSchema: {
        date: z.string().describe("Transaction date in YYYY-MM-DD format"),
        description: z.string().describe("Clear description of the transaction (shown in reports and journal list)"),
        amount: z.number().positive().describe("Transaction amount in Taka — must be greater than 0. e.g. 500.00"),
        fromAccountId: z.string().describe("Source account ID (money comes FROM here — will be credited). Get IDs from get_accounts."),
        toAccountId: z.string().describe("Destination account ID (money goes TO here — will be debited). Get IDs from get_accounts."),
        tags: z.array(z.string()).optional().describe("Optional tags for grouping (e.g. ['payroll', 'monthly'])")
      }
    },
    async ({ date: dateInput, description, amount, fromAccountId, toAccountId, tags }) => {
      try {
        const res = await recordSimplexJournalEntry({
          orgId,
          userId: "mcp-user",
          userName: "AI Agent",
          date: dateInput,
          description,
          amount,
          fromAccountId,
          toAccountId,
          tags
        });

        return {
          content: [{ 
            type: "text", 
            text: `✅ Journal entry recorded successfully.\nID: ${res.id}\nDate: ${res.finalDate}\nDescription: ${description}\nAmount: ${res.amount.toFixed(2)} Taka\nFrom: ${res.fromAcc.name} (${fromAccountId})\nTo: ${res.toAcc.name} (${toAccountId})`
          }]
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
  server.registerTool(
    "record_bulk_journal_entries",
    {
      description: `Records multiple financial transactions in a single call. Each entry uses the simplified from/to/amount interface — no manual debit/credit lines needed.

Use this when:
- Importing multiple historical transactions at once
- Recording a batch of transactions from a statement or report
- The user provides several unrelated transactions to record at the same time

MANDATORY WORKFLOW before calling this tool:
1. Call get_accounts to confirm all account IDs exist and are active
2. Confirm the list and accounts with the user before executing
3. Call get_tags to verify which tags exist — NEVER guess or create tags automatically
4. If any needed account or tag is missing, follow the respective create workflow first

DOs:
- All amounts must be positive and > 0
- Each entry must use different fromAccountId and toAccountId
- **TAGS**: Only existing Tag IDs or Names are allowed for each entry. Free text tags will be REJECTED.
- Use consistent tags across related entries for better reporting
- Use the time field if ordering of same-day entries matters

DON'Ts:
- Do not use archived accounts
- Do not call without user confirmation of the full list
- Do not ever record tags that haven't been approved by the user
- Do not use this for a single transaction — use record_journal_entry instead

Returns a summary of successes and any errors per entry.`,
      inputSchema: {
        entries: z.array(z.object({
          date: z.string().describe("YYYY-MM-DD format"),
          description: z.string().describe("Transaction description"),
          amount: z.number().positive().describe("Amount in Taka, must be > 0"),
          fromAccountId: z.string().describe("Source/credit account ID"),
          toAccountId: z.string().describe("Destination/debit account ID"),
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
            orgId,
            userId: "mcp-user",
            userName: "AI Agent",
            date: entryInput.date,
            description: entryInput.description,
            amount: entryInput.amount,
            fromAccountId: entryInput.fromAccountId,
            toAccountId: entryInput.toAccountId,
            tags: entryInput.tags,
            prefix: "[AI-Bulk]"
          });

          results.push(`✅ ${entryInput.description} → ${entryInput.amount.toFixed(2)} Taka (${res.id})`);
        } catch (e: any) {
          errors.push(`❌ "${entryInput.description}": ${e.message}`);
        }
      }

      const summary = [
        `Processed ${entries.length} entries — ${results.length} succeeded, ${errors.length} failed.`,
        ...(results.length > 0 ? ["", "Successes:", ...results] : []),
        ...(errors.length > 0 ? ["", "Errors:", ...errors] : [])
      ].join("\n");

      return {
        content: [{ type: "text", text: summary }],
        isError: errors.length > 0 && results.length === 0
      };
    }
  );

  // Tool: Update Journal Entry
  server.registerTool(
    "update_journal_entry",
    {
      description: `Modifies an existing journal entry. ALL lines are replaced when new from/to/amount is provided.

Use this to:
- Fix a wrong account or amount on a previously recorded entry
- Update the description, notes, or tags of an entry

⚠️ WARNING: Providing from/to/amount will FULLY REPLACE the existing transaction lines. This cannot be undone without creating another correcting entry.

DOs:
- Call get_journals first to get the correct entry ID and its current date
- Confirm the change with the user before executing
- Call get_accounts to verify replacement account IDs

DON'Ts:
- Do not update entries to use archived accounts
- Do not set amount to 0 or negative`,
      inputSchema: {
        id: z.string().describe("Journal entry ID (get from get_journals)"),
        oldDate: z.string().describe("The current date of the entry in YYYY-MM-DD format"),
        description: z.string().optional().describe("New description (replaces existing)"),
        tags: z.array(z.string()).optional().describe("New tags array (replaces existing)"),
        amount: z.number().positive().optional().describe("New amount in Taka (must be > 0). Requires fromAccountId and toAccountId too."),
        fromAccountId: z.string().optional().describe("New source/credit account ID"),
        toAccountId: z.string().optional().describe("New destination/debit account ID"),
      }
    },
    async ({ id, oldDate, description, tags, amount, fromAccountId, toAccountId }) => {
      try {
        const updates: any = {};
        if (description) updates.description = `[AI-Edit] ${description}`;
        if (tags) updates.tags = tags;
        updates.date = oldDate;

        let finalLines: any[] = [];

        if (amount !== undefined || fromAccountId || toAccountId) {
          if (!amount || !fromAccountId || !toAccountId) {
            return { 
              content: [{ type: "text", text: "Error: To update transaction lines, you must provide amount, fromAccountId, AND toAccountId together." }], 
              isError: true 
            };
          }

          // Validation
          const accs = await accountsDb.getAccounts(orgId);
          const accMap = new Map(accs.map((a: any) => [a.id, a]));
          const fromAcc = accMap.get(fromAccountId);
          const toAcc = accMap.get(toAccountId);

          if (!fromAcc || !toAcc) {
            return { content: [{ type: "text", text: "Error: One or both accounts not found." }], isError: true };
          }
          if (fromAcc.status === "archived" || toAcc.status === "archived") {
            return { content: [{ type: "text", text: "Error: One or both accounts are archived." }], isError: true };
          }

          const amountPaisa = Math.round(amount * 100);
          finalLines = [
            { orgId, journalId: id, accountId: toAccountId, amount: amountPaisa, date: oldDate },
            { orgId, journalId: id, accountId: fromAccountId, amount: -amountPaisa, date: oldDate }
          ];
        }

        const updated = await journalsDb.updateJournalEntry(
          orgId,
          id,
          oldDate,
          updates,
          finalLines,
          "mcp-user",
          "AI Agent"
        );

        return {
          content: [{ type: "text", text: `✅ Journal entry ${id} updated successfully.` }]
        };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  // Tool: Delete Journal Entry
  server.registerTool(
    "delete_journal_entry",
    {
      description: "Deletes a journal entry. REQUIRES explicit user confirmation for the specific ID.",
      inputSchema: {
        id: z.string().describe("The ID of the journal entry to delete"),
        date: z.string().describe("The date of the entry in YYYY-MM-DD format")
      }
    },
    async ({ id, date }) => {
      try {
        await journalsDb.deleteJournalEntry(orgId, id, date, "mcp-user", "AI Agent");
        return { content: [{ type: "text", text: `Journal entry ${id} deleted.` }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  // ─── RECURRING ────────────────────────────────────────────────────────────────

  // Tool: List Recurring Entries
  server.registerTool(
    "get_recurring_entries",
    {
      description: "Returns all recurring journal entry templates for this organization.",
      inputSchema: {}
    },
    async () => {
      const entries = await recurringDb.getRecurringEntries(orgId);
      return {
        content: [{ type: "text", text: JSON.stringify(entries, null, 2) }]
      };
    }
  );

  // Tool: Create Recurring Entry
  server.registerTool(
    "create_recurring_entry",
    {
      description: `Sets up a recurring transaction (e.g. monthly rent, payroll).

MANDATORY WORKFLOW:
- ALWAYS confirm the schedule and accounts with the user first.
- Use 'monthly', 'weekly', or 'yearly' for frequency.`,
      inputSchema: {
        name: z.string().describe("Name of the recurring profile (e.g. 'Monthly Rent')"),
        description: z.string().describe("Description for the generated journal entries"),
        frequency: z.enum(["weekly", "monthly", "yearly"]),
        dayOfMonth: z.number().min(1).max(31).optional(),
        dayOfWeek: z.number().min(0).max(6).optional(),
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
        const entry = {
          orgId,
          id,
          ...args,
          interval: 1,
          startDate: today,
          nextProcessDate: today,
          isActive: true,
          createdAt: new Date().toISOString()
        };
        await recurringDb.createRecurringEntry(entry, "mcp-user", "AI Agent");
        return {
          content: [{ type: "text", text: `Recurring entry '${args.name}' created with ID ${id}.` }]
        };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  // ─── REPORTING ────────────────────────────────────────────────────────────────

  // Tool: Get Canonical Financial Report
  server.registerTool(
    "get_financial_report",
    {
      description: `Fetches full financial reports (Trial Balance, Balance Sheet, Income Statement) using the system's canonical reporting logic.
      
ALWAYS use this tool for questions like:
- "What's our total revenue this year?"
- "Show me our balance sheet as of today."
- "Are we profitable this month?"
- "Check if the trial balance is in balance."

Report Types:
- trial-balance: lists all accounts with non-zero balances
- balance-sheet: Assets = Liabilities + Equity
- income-statement: Income - Expenses = Net Profit/Loss

The report sanitizes all figures from Paisa to Taka automatically for the AI context.`,
      inputSchema: {
        reportType: z.enum(["trial-balance", "balance-sheet", "income-statement"]),
        startDate: z.string().optional().describe("Period start YYYY-MM-DD"),
        endDate: z.string().optional().describe("Period end YYYY-MM-DD"),
        tagIds: z.array(z.string()).optional().describe("Filter reporting by tag IDs")
      }
    },
    async ({ reportType, startDate, endDate, tagIds }) => {
      try {
        const { generateReportData } = await import("../../src/lib/reports");
        const report = (await generateReportData(orgId, reportType, startDate, endDate, undefined, tagIds)) as any;
        
        // Convert paisa to Taka for canonical AI response
        if (report.accounts) report.accounts = report.accounts.map((a: any) => ({ ...a, balance: a.balance / 100 }));
        if (report.assets) report.assets = report.assets.map((a: any) => ({ ...a, balance: a.balance / 100 }));
        if (report.liabilities) report.liabilities = report.liabilities.map((a: any) => ({ ...a, balance: a.balance / 100 }));
        if (report.equity) report.equity = report.equity.map((a: any) => ({ ...a, balance: a.balance / 100 }));
        if (report.income) report.income = report.income.map((a: any) => ({ ...a, balance: a.balance / 100 }));
        if (report.expenses) report.expenses = report.expenses.map((a: any) => ({ ...a, balance: a.balance / 100 }));
        
        if (report.totalDebits) report.totalDebits = report.totalDebits / 100;
        if (report.totalCredits) report.totalCredits = report.totalCredits / 100;

        return {
          content: [{ type: "text", text: JSON.stringify(report, null, 2) }]
        };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error generating report: ${e.message}` }], isError: true };
      }
    }
  );

  // 3. Connect as Serverless Function
  try {
    const result = await server.connect(transport);
    return transport.handleRequest(req);
  } catch (error) {
    console.error("MCP Server connection error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
};
