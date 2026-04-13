import { z } from "zod";

/**
 * 🛠️ SHARED AI TOOL DEFINITIONS
 * This file is the single source of truth for both the internal Chatbot tools
 * and the external MCP server.
 */

export const TOOL_SPECS = {
  // --- ACCOUNTS ---
  get_accounts: {
    description: "Returns all accounts in the chart of accounts for this organization.",
    parameters: z.object({}),
  },
  create_account: {
    description: `Adds a new account to the chart of accounts.
GUIDANCE:
- If the ledger is new, suggest creating an 'Opening Balance Equity' (Equity) account.
- For electronics/furniture (>500 Taka), suggest the 'Asset' category (Equipment).
- Use lowercase hyphenated IDs (e.g. 'office-expense').`,
    parameters: z.object({
      id: z.string().describe("Unique lowercase hyphen-separated ID"),
      name: z.string().describe("Human-readable display name"),
      category: z.enum(["asset", "liability", "equity", "income", "expense"]),
    }),
  },
  archive_account: {
    description: "Archives an account.",
    parameters: z.object({ accountId: z.string() }),
  },

  // --- TAGS ---
  get_tags: {
    description: "Returns all formal tags for this organization.",
    parameters: z.object({}),
  },
  create_tag: {
    description: "Creates a new formal tag. REQUIRES PRIOR USER CONFIRMATION. Do not call this without explicitly asking the user first.",
    parameters: z.object({
      name: z.string(),
      color: z.string(),
      description: z.string().optional(),
    }),
  },
  delete_tag: {
    description: "Deletes a formal tag.",
    parameters: z.object({ tagId: z.string() }),
  },

  // --- JOURNALS ---
  get_journals: {
    description: "Fetches journal entries, optionally filtered by date range and tags.",
    parameters: z.object({
      startDate: z.string().optional().describe("YYYY-MM-DD"),
      endDate: z.string().optional().describe("YYYY-MM-DD"),
      tagIds: z.array(z.string()).optional(),
    }),
  },
  record_journal_entry: {
    description: `Records a single financial transaction.
🛡️ ENFORCED RULES:
- Both accounts must be active and distinct.
- Amount must be positive.
💡 SUGGESTIONS:
- If both are Asset accounts, label as 'Transfer'.
- For starting balances, use an 'Opening Balance Equity' account as the source.
- For debt payments, suggest splitting Principal (Liability) and Interest (Expense).`,
    parameters: z.object({
      date: z.string().describe("YYYY-MM-DD"),
      description: z.string(),
      amount: z.number().positive(),
      fromAccountId: z.string().describe("Money comes FROM here (Credit)"),
      toAccountId: z.string().describe("Money goes TO here (Debit)"),
      tags: z.array(z.string()).optional().describe("List of existing Tag IDs only."),
    }),
  },
  record_bulk_journal_entries: {
    description: "Records multiple transactions in one go. Useful for imports or multi-line statements.",
    parameters: z.object({
      entries: z.array(z.object({
        date: z.string(),
        description: z.string(),
        amount: z.number().positive(),
        fromAccountId: z.string(),
        toAccountId: z.string(),
        tags: z.array(z.string()).optional()
      }))
    }),
  },
  update_journal_entry: {
    description: "Modifies a journal entry.",
    parameters: z.object({
      id: z.string(),
      oldDate: z.string().describe("YYYY-MM-DD"),
      description: z.string().optional(),
      tags: z.array(z.string()).optional(),
      amount: z.number().positive().optional(),
      fromAccountId: z.string().optional(),
      toAccountId: z.string().optional(),
    }),
  },
  delete_journal_entry: {
    description: "Deletes a journal entry.",
    parameters: z.object({ id: z.string(), date: z.string().describe("YYYY-MM-DD") }),
  },

  // --- REPORTS ---
  get_account_balance: {
    description: `Returns the life-to-date canonical balance of a specific account.
⚠️ CRITICAL: NEVER state or infer any account balance without calling this tool first.
⚠️ For Asset, Liability, and Equity accounts, balances are ALWAYS life-to-date (all-time), regardless of date filters.
⚠️ For Income and Expense accounts, balances reflect ONLY the supplied date range.`,
    parameters: z.object({
      accountId: z.string().describe("The account ID to query"),
      startDate: z.string().optional().describe("YYYY-MM-DD — for income/expense period filtering only, has NO effect on asset/liability/equity balances"),
      endDate: z.string().optional().describe("YYYY-MM-DD — upper bound for the query"),
    }),
  },
  get_financial_summary: {
    description: `Returns a Profit & Loss summary for a specific period (income vs expenses).
⚠️ This tool does NOT return account balances. For current balances, use get_financial_report('balance-sheet').`,
    parameters: z.object({
      startDate: z.string().optional().describe("YYYY-MM-DD"),
      endDate: z.string().optional().describe("YYYY-MM-DD"),
    }),
  },
  get_financial_report: {
    description: `Fetches full financial reports. USE THIS for any question about current balances.
- 'balance-sheet': Current asset, liability, and equity account balances (always life-to-date).
- 'income-statement': Revenue and expenses for a specific period.
- 'trial-balance': All account balances for double-entry verification.
⚠️ NEVER infer account balances from income/expense data — always call this tool.`,
    parameters: z.object({
      reportType: z.enum(["trial-balance", "balance-sheet", "income-statement"]),
      startDate: z.string().optional().describe("YYYY-MM-DD — for income/expense filtering only; has NO effect on balance-sheet asset balances"),
      endDate: z.string().optional().describe("YYYY-MM-DD"),
      tagIds: z.array(z.string()).optional(),
    }),
  },

  // --- RECURRING ---
  get_recurring_entries: {
    description: "Returns all recurring transaction schedules.",
    parameters: z.object({}),
  },
  create_recurring_entry: {
    description: "Sets up a new recurring transaction schedule.",
    parameters: z.object({
      description: z.string(),
      amount: z.number().positive(),
      fromAccountId: z.string(),
      toAccountId: z.string(),
      frequency: z.enum(["daily", "weekly", "monthly", "yearly"]),
      dayOfMonth: z.number().optional(),
      dayOfWeek: z.number().optional(),
      startDate: z.string().describe("YYYY-MM-DD"),
      tags: z.array(z.string()).optional()
    }),
  },
  delete_recurring_entry: {
    description: "Deletes a recurring transaction schedule.",
    parameters: z.object({
      id: z.string().describe("The ID of the recurring entry to delete")
    }),
  },
};
