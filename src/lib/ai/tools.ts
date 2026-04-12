import { tool } from "ai";
import { z } from "zod";
import * as journalsDb from "../db/journals";
import * as accountsDb from "../db/accounts";
import * as tagsDb from "../db/tags";
import { generateReportData } from "../reports";

/**
 * Helper to check mutation permissions
 */
const ensureCanMutate = (role: string, isOwner: boolean) => {
  if (isOwner) return true;
  if (role === "admin" || role === "member") return true; // Editor role
  throw new Error("Forbidden: Viewers cannot perform this action.");
};

export const createAiTools = (orgId: string, userId: string, userName: string, role: string, isOwner: boolean) => ({
  // --- ACCOUNTS ---
  get_accounts: tool({
    description: "Returns all accounts in the chart of accounts for this organization.",
    inputSchema: z.object({}),
    execute: async () => {
      const accs = await accountsDb.getAccounts(orgId);
      return accs.map((a: any) => ({ id: a.id, name: a.name, category: a.category, status: a.status }));
    },
  }),

  create_account: tool({
    description: "Adds a new account to the chart of accounts.",
    inputSchema: z.object({
      id: z.string().describe("Unique lowercase hyphen-separated ID, e.g. 'checking-main'"),
      name: z.string().describe("Human-readable display name, e.g. 'Main Checking Account'"),
      category: z.enum(["asset", "liability", "equity", "income", "expense"]),
    }),
    execute: async ({ id, name, category }) => {
      ensureCanMutate(role, isOwner);
      const existing = await accountsDb.getAccounts(orgId);
      if (existing.find((a: any) => a.id === id)) {
        throw new Error(`Account ID '${id}' already exists.`);
      }
      await accountsDb.createAccount({ orgId, id, name, category, status: "active", createdAt: new Date().toISOString() }, userId, userName);
      return `Account '${name}' created successfully.`;
    },
  }),

  // --- TAGS ---
  get_tags: tool({
    description: "Returns all formal tags for this organization.",
    inputSchema: z.object({}),
    execute: async () => {
      const tags = await tagsDb.getTags(orgId);
      return tags.map((t: any) => ({ id: t.id, name: t.name, color: t.color }));
    },
  }),

  create_tag: tool({
    description: "Creates a new formal tag. REQUIRES PRIOR USER CONFIRMATION. Do not call this without explicitly asking the user first.",
    inputSchema: z.object({
      name: z.string(),
      color: z.string(),
      description: z.string().optional(),
    }),
    execute: async (args) => {
      ensureCanMutate(role, isOwner);
      const tag = await tagsDb.createTag({ orgId, ...args });
      return `Tag '${tag.name}' created with ID ${tag.id}.`;
    },
  }),

  // --- JOURNALS ---
  get_journals: tool({
    description: "Fetches journal entries, optionally filtered by date range and tags.",
    inputSchema: z.object({
      startDate: z.string().optional().describe("YYYY-MM-DD"),
      endDate: z.string().optional().describe("YYYY-MM-DD"),
      tagIds: z.array(z.string()).optional(),
    }),
    execute: async ({ startDate, endDate, tagIds }) => {
      const entries = await journalsDb.getJournalEntries(orgId, startDate, endDate, tagIds);
      const enriched = await Promise.all(entries.map(async (e) => {
        const lines = await journalsDb.getJournalLinesForJournal(orgId, e.id);
        return {
          id: e.id,
          date: e.date.slice(0, 10),
          description: e.description,
          tags: e.tags ?? [],
          lines: lines.map((l: any) => ({ accountId: l.accountId, amount: l.amount / 100 }))
        };
      }));
      return enriched;
    },
  }),

  record_journal_entry: tool({
    description: "Records a single financial transaction. Automatically handles debit/credit.",
    inputSchema: z.object({
      date: z.string().describe("YYYY-MM-DD"),
      description: z.string(),
      amount: z.number().positive(),
      fromAccountId: z.string().describe("Money comes FROM here (Credit)"),
      toAccountId: z.string().describe("Money goes TO here (Debit)"),
      tags: z.array(z.string()).optional().describe("List of existing Tag IDs only. Do not use random text."),
    }),
    execute: async ({ date, description, amount, fromAccountId, toAccountId, tags }) => {
      ensureCanMutate(role, isOwner);
      const amountPaisa = Math.round(amount * 100);
      const id = require("crypto").randomUUID();
      const finalDate = date.slice(0, 10);

      const entry = { orgId, id, date: finalDate, description: `[AI] ${description}`, tags, createdAt: new Date().toISOString() };
      const lines = [
        { orgId, journalId: id, accountId: toAccountId, amount: amountPaisa, date: finalDate },
        { orgId, journalId: id, accountId: fromAccountId, amount: -amountPaisa, date: finalDate }
      ];

      await journalsDb.createJournalEntry(entry, lines, userId, userName);
      return `✅ Recorded: ${description} (${amount.toFixed(2)} Taka)`;
    },
  }),

  get_account_balance: tool({
    description: "Returns the net balance of a specific account using canonical reporting logic.",
    inputSchema: z.object({
      accountId: z.string(),
      startDate: z.string().optional().describe("YYYY-MM-DD"),
      endDate: z.string().optional().describe("YYYY-MM-DD"),
    }),
    execute: async ({ accountId, startDate, endDate }) => {
      // Use trial-balance to get the most accurate LTDB/PTDB balance
      const report = (await generateReportData(orgId, "trial-balance", startDate, endDate)) as any;
      const acc = report.accounts?.find((a: any) => a.id === accountId);
      
      if (!acc) return `Account '${accountId}' not found in report.`;
      
      const balance = acc.balance / 100;
      return `Canonical balance for '${accountId}': ${balance.toFixed(2)} Taka`;
    },
  }),

  get_financial_summary: tool({
    description: "Returns a high-level Profit & Loss summary for a period using canonical reporting logic.",
    inputSchema: z.object({
      startDate: z.string().optional().describe("YYYY-MM-DD"),
      endDate: z.string().optional().describe("YYYY-MM-DD"),
    }),
    execute: async ({ startDate, endDate }) => {
      const report = (await generateReportData(orgId, "income-statement", startDate, endDate)) as any;
      
      const totalIncome = (report.income || []).reduce((sum: any, item: any) => sum + Math.abs(item.balance), 0);
      const totalExpenses = (report.expenses || []).reduce((sum: any, item: any) => sum + Math.abs(item.balance), 0);
      
      return {
        income: totalIncome / 100,
        expenses: totalExpenses / 100,
        net: (totalIncome - totalExpenses) / 100,
        period: `${startDate || "start"} to ${endDate || "now"}`
      };
    },
  }),

  get_financial_report: tool({
    description: "Fetches full financial reports (Trial Balance, Balance Sheet, Income Statement). ALWAYS use this for report-related queries.",
    inputSchema: z.object({
      reportType: z.enum(["trial-balance", "balance-sheet", "income-statement"]),
      startDate: z.string().optional().describe("YYYY-MM-DD"),
      endDate: z.string().optional().describe("YYYY-MM-DD"),
      tagIds: z.array(z.string()).optional(),
    }),
    execute: async ({ reportType, startDate, endDate, tagIds }) => {
      const report = (await generateReportData(orgId, reportType, startDate, endDate, undefined, tagIds)) as any;
      
      // Sanitizing for LLM context (paisa to base currency)
      if (report.accounts) {
        report.accounts = report.accounts.map((a: any) => ({ ...a, balance: a.balance / 100 }));
      }
      if (report.assets) report.assets = report.assets.map((a: any) => ({ ...a, balance: a.balance / 100 }));
      if (report.liabilities) report.liabilities = report.liabilities.map((a: any) => ({ ...a, balance: a.balance / 100 }));
      if (report.equity) report.equity = report.equity.map((a: any) => ({ ...a, balance: a.balance / 100 }));
      if (report.income) report.income = report.income.map((a: any) => ({ ...a, balance: a.balance / 100 }));
      if (report.expenses) report.expenses = report.expenses.map((a: any) => ({ ...a, balance: a.balance / 100 }));
      
      if (report.totalDebits) report.totalDebits = report.totalDebits / 100;
      if (report.totalCredits) report.totalCredits = report.totalCredits / 100;
      
      return report;
    },
  }),
});
