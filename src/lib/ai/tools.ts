import { tool } from "ai";
import { z } from "zod";
import * as journalsDb from "../db/journals";
import * as accountsDb from "../db/accounts";
import * as tagsDb from "../db/tags";

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
    description: "Returns the net balance of a specific account.",
    inputSchema: z.object({
      accountId: z.string(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }),
    execute: async ({ accountId, startDate, endDate }) => {
      const lines = await journalsDb.getAccountLines(orgId, accountId, startDate, endDate);
      const balance = lines.reduce((sum, line) => sum + line.amount, 0) / 100;
      return `Balance for '${accountId}': ${balance.toFixed(2)} Taka`;
    },
  }),

  get_financial_summary: tool({
    description: "Returns a high-level Profit & Loss summary for a period.",
    inputSchema: z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }),
    execute: async ({ startDate, endDate }) => {
      const [accs, entries] = await Promise.all([
        accountsDb.getAccounts(orgId),
        journalsDb.getJournalEntries(orgId, startDate, endDate)
      ]);
      const catMap = new Map(accs.map(a => [a.id, a.category]));
      let income = 0, expenses = 0;
      for (const entry of entries) {
        const lines = await journalsDb.getJournalLinesForJournal(orgId, entry.id);
        for (const line of lines) {
          const cat = catMap.get(line.accountId);
          if (cat === "income") income -= line.amount;
          else if (cat === "expense") expenses += line.amount;
        }
      }
      return {
        income: income / 100,
        expenses: expenses / 100,
        net: (income - expenses) / 100,
        period: `${startDate || "start"} to ${endDate || "now"}`
      };
    },
  }),
});
