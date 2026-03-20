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
  const transport = new WebStandardStreamableHTTPServerTransport();
  
  const server = new McpServer({
    name: "Sulfur Ledger MCP Server",
    version: "2.0.0"
  }, {
    capabilities: { tools: {}, resources: {} }
  });

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
        await accountsDb.createAccount(account);
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
        await accountsDb.archiveAccount(orgId, accountId);
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
        endDate: z.string().optional().describe("End date filter in YYYY-MM-DD format (inclusive)")
      }
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

DOs:
- amount MUST be positive and greater than 0 (e.g. 150.75)
- Use descriptive descriptions — they appear in reports
- Add tags to group related transactions (e.g. "payroll", "marketing", "rent")
- Provide a date in YYYY-MM-DD format; optionally add time HH:mm for ordering

DON'Ts:
- Never use the same account for both fromAccountId and toAccountId
- Never use archived accounts
- Never record entries without confirming the accounts with the user first
- Do not record duplicate entries — check get_journals if unsure`,
      inputSchema: {
        date: z.string().describe("Transaction date: YYYY-MM-DD or full ISO 8601 string"),
        time: z.string().optional().describe("Optional time HH:mm if date is YYYY-MM-DD (used for ordering same-day entries)"),
        description: z.string().describe("Clear description of the transaction (shown in reports and journal list)"),
        amount: z.number().positive().describe("Transaction amount in Taka — must be greater than 0. e.g. 500.00"),
        fromAccountId: z.string().describe("Source account ID (money comes FROM here — will be credited). Get IDs from get_accounts."),
        toAccountId: z.string().describe("Destination account ID (money goes TO here — will be debited). Get IDs from get_accounts."),
        notes: z.string().optional().describe("Optional internal notes or reference numbers"),
        tags: z.array(z.string()).optional().describe("Optional tags for grouping (e.g. ['payroll', 'monthly'])")
      }
    },
    async ({ date: dateInput, time, description, amount, fromAccountId, toAccountId, notes, tags }) => {
      try {
        // Validate accounts exist and are active
        const accs = await accountsDb.getAccounts(orgId);
        const accMap = new Map(accs.map((a: any) => [a.id, a]));
        
        const fromAcc = accMap.get(fromAccountId);
        const toAcc = accMap.get(toAccountId);
        
        if (!fromAcc) {
          return { content: [{ type: "text", text: `Error: Account '${fromAccountId}' (fromAccountId) not found. Call get_accounts to see valid account IDs.` }], isError: true };
        }
        if (!toAcc) {
          return { content: [{ type: "text", text: `Error: Account '${toAccountId}' (toAccountId) not found. Call get_accounts to see valid account IDs.` }], isError: true };
        }
        if (fromAcc.status === "archived") {
          return { content: [{ type: "text", text: `Error: Account '${fromAccountId}' (${fromAcc.name}) is archived and cannot be used in new entries.` }], isError: true };
        }
        if (toAcc.status === "archived") {
          return { content: [{ type: "text", text: `Error: Account '${toAccountId}' (${toAcc.name}) is archived and cannot be used in new entries.` }], isError: true };
        }
        if (fromAccountId === toAccountId) {
          return { content: [{ type: "text", text: `Error: fromAccountId and toAccountId cannot be the same account.` }], isError: true };
        }

        const amountPaisa = Math.round(amount * 100);
        if (amountPaisa <= 0) {
          return { content: [{ type: "text", text: `Error: amount must be greater than 0.` }], isError: true };
        }

        let finalDate = dateInput;
        if (dateInput.length === 10) {
          const timePart = time || new Date().toISOString().slice(11, 19);
          finalDate = `${dateInput}T${timePart}Z`;
        }

        const { randomUUID } = require("crypto");
        const id = randomUUID();

        const parsedLines = [
          { orgId, journalId: id, accountId: toAccountId, amount: amountPaisa, date: finalDate },    // Debit
          { orgId, journalId: id, accountId: fromAccountId, amount: -amountPaisa, date: finalDate }  // Credit
        ];

        const entry = {
          orgId,
          id,
          date: finalDate,
          description: `[AI] ${description}`,
          notes,
          tags,
          createdAt: new Date().toISOString()
        };

        await journalsDb.createJournalEntry(entry, parsedLines, "mcp-user");

        return {
          content: [{ 
            type: "text", 
            text: `✅ Journal entry recorded successfully.\nID: ${id}\nDate: ${finalDate}\nDescription: ${description}\nAmount: ${amount.toFixed(2)} Taka\nFrom: ${fromAcc.name} (${fromAccountId})\nTo: ${toAcc.name} (${toAccountId})`
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
3. If any needed account is missing, follow the create_account workflow first

DOs:
- All amounts must be positive and > 0
- Each entry must use different fromAccountId and toAccountId
- Use consistent tags across related entries for better reporting
- Use the time field if ordering of same-day entries matters

DON'Ts:
- Do not use archived accounts
- Do not call without user confirmation of the full list
- Do not use this for a single transaction — use record_journal_entry instead

Returns a summary of successes and any errors per entry.`,
      inputSchema: {
        entries: z.array(z.object({
          date: z.string().describe("YYYY-MM-DD or ISO 8601 datetime"),
          time: z.string().optional().describe("Optional HH:mm time for same-day ordering"),
          description: z.string().describe("Transaction description"),
          amount: z.number().positive().describe("Amount in Taka, must be > 0"),
          fromAccountId: z.string().describe("Source/credit account ID"),
          toAccountId: z.string().describe("Destination/debit account ID"),
          notes: z.string().optional(),
          tags: z.array(z.string()).optional()
        }))
      }
    },
    async ({ entries }) => {
      // Pre-load accounts for validation
      const accs = await accountsDb.getAccounts(orgId);
      const accMap = new Map(accs.map((a: any) => [a.id, a]));

      const results: string[] = [];
      const errors: string[] = [];
      
      for (const entryInput of entries) {
        try {
          const fromAcc = accMap.get(entryInput.fromAccountId);
          const toAcc = accMap.get(entryInput.toAccountId);

          if (!fromAcc) throw new Error(`fromAccountId '${entryInput.fromAccountId}' not found`);
          if (!toAcc) throw new Error(`toAccountId '${entryInput.toAccountId}' not found`);
          if (fromAcc.status === "archived") throw new Error(`Account '${entryInput.fromAccountId}' is archived`);
          if (toAcc.status === "archived") throw new Error(`Account '${entryInput.toAccountId}' is archived`);
          if (entryInput.fromAccountId === entryInput.toAccountId) throw new Error(`fromAccountId and toAccountId cannot be the same`);

          const amountPaisa = Math.round(entryInput.amount * 100);
          if (amountPaisa <= 0) throw new Error(`amount must be > 0`);

          let finalDate = entryInput.date;
          if (entryInput.date.length === 10) {
            const timePart = entryInput.time || new Date().toISOString().slice(11, 19);
            finalDate = `${entryInput.date}T${timePart}Z`;
          }

          const { randomUUID } = require("crypto");
          const id = randomUUID();
          
          const parsedLines = [
            { orgId, journalId: id, accountId: entryInput.toAccountId, amount: amountPaisa, date: finalDate },
            { orgId, journalId: id, accountId: entryInput.fromAccountId, amount: -amountPaisa, date: finalDate }
          ];

          const entry = {
            orgId,
            id,
            date: finalDate,
            description: `[AI-Bulk] ${entryInput.description}`,
            notes: entryInput.notes,
            tags: entryInput.tags,
            createdAt: new Date().toISOString()
          };

          await journalsDb.createJournalEntry(entry, parsedLines, "mcp-user");
          results.push(`✅ ${entryInput.description} → ${entryInput.amount.toFixed(2)} Taka (${id})`);
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
        oldDate: z.string().describe("The current date of the entry — required to locate it in the database (ISO string)"),
        description: z.string().optional().describe("New description (replaces existing)"),
        notes: z.string().optional().describe("New notes (replaces existing)"),
        tags: z.array(z.string()).optional().describe("New tags array (replaces existing)"),
        amount: z.number().positive().optional().describe("New amount in Taka (must be > 0). Requires fromAccountId and toAccountId too."),
        fromAccountId: z.string().optional().describe("New source/credit account ID"),
        toAccountId: z.string().optional().describe("New destination/debit account ID"),
      }
    },
    async ({ id, oldDate, description, notes, tags, amount, fromAccountId, toAccountId }) => {
      try {
        const updates: any = {};
        if (description) updates.description = `[AI-Edit] ${description}`;
        if (notes !== undefined) updates.notes = notes;
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

          // Validate accounts
          const accs = await accountsDb.getAccounts(orgId);
          const accMap = new Map(accs.map((a: any) => [a.id, a]));
          const fromAcc = accMap.get(fromAccountId);
          const toAcc = accMap.get(toAccountId);
          
          if (!fromAcc) return { content: [{ type: "text", text: `Error: fromAccountId '${fromAccountId}' not found.` }], isError: true };
          if (!toAcc) return { content: [{ type: "text", text: `Error: toAccountId '${toAccountId}' not found.` }], isError: true };
          if (fromAcc.status === "archived") return { content: [{ type: "text", text: `Error: Account '${fromAccountId}' is archived.` }], isError: true };
          if (toAcc.status === "archived") return { content: [{ type: "text", text: `Error: Account '${toAccountId}' is archived.` }], isError: true };
          if (fromAccountId === toAccountId) return { content: [{ type: "text", text: `Error: fromAccountId and toAccountId cannot be the same.` }], isError: true };

          const amountPaisa = Math.round(amount * 100);
          if (amountPaisa <= 0) return { content: [{ type: "text", text: `Error: amount must be > 0.` }], isError: true };

          finalLines = [
            { orgId, journalId: id, accountId: toAccountId, amount: amountPaisa, date: oldDate },
            { orgId, journalId: id, accountId: fromAccountId, amount: -amountPaisa, date: oldDate }
          ];
        } else {
          return { 
            content: [{ type: "text", text: "Error: You must provide at least one of: description, notes, tags, or the full amount+fromAccountId+toAccountId set." }], 
            isError: true 
          };
        }

        await journalsDb.updateJournalEntry(orgId, id, oldDate, updates, finalLines, "mcp-user");
        return {
          content: [{ type: "text", text: `✅ Journal entry ${id} updated successfully.` }]
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
  server.registerTool(
    "delete_journal_entry",
    {
      description: `Permanently deletes a journal entry and all its lines. An audit log record is created.

⚠️ WARNING: This action is IRREVERSIBLE. The entry and its transaction lines will be permanently removed.

DOs:
- Call get_journals first to confirm the correct entry ID and date
- Always confirm explicitly with the user before deleting

DON'Ts:
- Never delete without explicit user confirmation
- Never guess the entry ID — always retrieve it from get_journals first`,
      inputSchema: {
        id: z.string().describe("Journal entry ID to delete (get from get_journals)"),
        date: z.string().describe("The date of the entry (ISO string) — required to locate it in the database")
      }
    },
    async ({ id, date }) => {
      try {
        await journalsDb.deleteJournalEntry(orgId, id, date, "mcp-user");
        return {
          content: [{ type: "text", text: `✅ Journal entry ${id} has been permanently deleted. An audit log has been created.` }]
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
