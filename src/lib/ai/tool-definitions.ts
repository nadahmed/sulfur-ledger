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
    description: "Returns the net balance of a specific account using canonical reporting logic.",
    parameters: z.object({
      accountId: z.string(),
      startDate: z.string().optional().describe("YYYY-MM-DD"),
      endDate: z.string().optional().describe("YYYY-MM-DD"),
    }),
  },
  get_financial_summary: {
    description: "Returns a high-level Profit & Loss summary for a period.",
    parameters: z.object({
      startDate: z.string().optional().describe("YYYY-MM-DD"),
      endDate: z.string().optional().describe("YYYY-MM-DD"),
    }),
  },
  get_financial_report: {
    description: "Fetches full financial reports (Trial Balance, Balance Sheet, Income Statement).",
    parameters: z.object({
      reportType: z.enum(["trial-balance", "balance-sheet", "income-statement"]),
      startDate: z.string().optional().describe("YYYY-MM-DD"),
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
