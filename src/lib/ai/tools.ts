import { tool } from "ai";
import * as journalsDb from "../db/journals";
import * as accountsDb from "../db/accounts";
import * as tagsDb from "../db/tags";
import * as recurringDb from "../db/recurring";
import { generateReportData } from "../reports";
import { recordSimplexJournalEntry } from "./journal-shared";
import { randomUUID } from "crypto";
import { TOOL_SPECS } from "./tool-definitions";

/**
 * Helper to check mutation permissions
 */
const ensureCanMutate = (role: string, isOwner: boolean) => {
  if (role === "viewer") {
    throw new Error("Forbidden: Viewers cannot perform this action.");
  }
  if (isOwner || role === "admin" || role === "member") return true;
  throw new Error("Forbidden: Insufficient permissions.");
};

export const createAiTools = (orgId: string, userId: string, userName: string, role: string, isOwner: boolean, ipAddress?: string, userAgent?: string) => ({
  // --- ACCOUNTS ---
  get_accounts: tool({
    description: TOOL_SPECS.get_accounts.description,
    inputSchema: TOOL_SPECS.get_accounts.parameters,
    execute: async () => {
      const accs = await accountsDb.getAccounts(orgId);
      return accs.map((a: any) => ({ id: a.id, name: a.name, category: a.category, status: a.status }));
    },
  }),

  create_account: tool({
    description: TOOL_SPECS.create_account.description,
    inputSchema: TOOL_SPECS.create_account.parameters,
    execute: async ({ id, name, category }) => {
      ensureCanMutate(role, isOwner);
      const existing = await accountsDb.getAccounts(orgId);
      if (existing.find((a: any) => a.id === id)) {
        throw new Error(`Account ID '${id}' already exists.`);
      }
      await accountsDb.createAccount({ orgId, id, name, category, status: "active", createdAt: new Date().toISOString() }, userId, userName, { ipAddress, userAgent });
      return `Account '${name}' created successfully.`;
    },
  }),

  // --- TAGS ---
  get_tags: tool({
    description: TOOL_SPECS.get_tags.description,
    inputSchema: TOOL_SPECS.get_tags.parameters,
    execute: async () => {
      const tags = await tagsDb.getTags(orgId);
      return tags.map((t: any) => ({ id: t.id, name: t.name, color: t.color }));
    },
  }),

  create_tag: tool({
    description: TOOL_SPECS.create_tag.description,
    inputSchema: TOOL_SPECS.create_tag.parameters,
    execute: async (args) => {
      ensureCanMutate(role, isOwner);
      const tag = await tagsDb.createTag({ orgId, ...args }, userId, userName, { ipAddress, userAgent });
      return `Tag '${tag.name}' created with ID ${tag.id}.`;
    },
  }),

  // --- JOURNALS ---
  get_journals: tool({
    description: TOOL_SPECS.get_journals.description,
    inputSchema: TOOL_SPECS.get_journals.parameters,
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
    description: TOOL_SPECS.record_journal_entry.description,
    inputSchema: TOOL_SPECS.record_journal_entry.parameters,
    execute: async ({ date, description, amount, fromAccountId, toAccountId, tags }) => {
      ensureCanMutate(role, isOwner);
      const res = await recordSimplexJournalEntry({
        orgId,
        userId,
        userName,
        date,
        description,
        amount,
        fromAccountId,
        toAccountId,
        tags,
        ipAddress,
        userAgent
      });
      return `✅ Recorded: ${description} (${res.amount.toFixed(2)} Taka)`;
    },
  }),

  record_bulk_journal_entries: tool({
    description: TOOL_SPECS.record_bulk_journal_entries.description,
    inputSchema: TOOL_SPECS.record_bulk_journal_entries.parameters,
    execute: async ({ entries }) => {
      ensureCanMutate(role, isOwner);
      const results: string[] = [];
      for (const entry of entries) {
        const res = await recordSimplexJournalEntry({
          orgId, userId, userName, ...entry,
          prefix: "[AI-Bulk]", ipAddress, userAgent
        });
        results.push(`✅ ${entry.description} (${res.amount.toFixed(2)})`);
      }
      return `Processed ${entries.length} entries:\n${results.join("\n")}`;
    },
  }),

  get_account_balance: tool({
    description: TOOL_SPECS.get_account_balance.description,
    inputSchema: TOOL_SPECS.get_account_balance.parameters,
    execute: async ({ accountId, startDate, endDate }) => {
      const report = (await generateReportData(orgId, "trial-balance", startDate, endDate)) as any;
      const acc = report.accounts?.find((a: any) => a.id === accountId);
      if (!acc) return `Account '${accountId}' not found in report.`;
      const balance = acc.balance / 100;
      return `Canonical balance for '${accountId}': ${balance.toFixed(2)} Taka`;
    },
  }),

  get_financial_summary: tool({
    description: TOOL_SPECS.get_financial_summary.description,
    inputSchema: TOOL_SPECS.get_financial_summary.parameters,
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
    description: TOOL_SPECS.get_financial_report.description,
    inputSchema: TOOL_SPECS.get_financial_report.parameters,
    execute: async ({ reportType, startDate, endDate, tagIds }) => {
      const report = (await generateReportData(orgId, reportType, startDate, endDate, undefined, tagIds)) as any;

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

  // --- RECURRING ---
  get_recurring_entries: tool({
    description: TOOL_SPECS.get_recurring_entries.description,
    inputSchema: TOOL_SPECS.get_recurring_entries.parameters,
    execute: async () => {
      const entries = await recurringDb.getRecurringEntries(orgId);
      return entries.map(e => ({
        id: e.id,
        description: e.description,
        amount: e.amount / 100,
        frequency: e.frequency,
        nextDate: e.nextProcessDate,
        isActive: e.isActive
      }));
    },
  }),

  create_recurring_entry: tool({
    description: TOOL_SPECS.create_recurring_entry.description,
    inputSchema: TOOL_SPECS.create_recurring_entry.parameters,
    execute: async (args) => {
      ensureCanMutate(role, isOwner);
      const id = randomUUID();
      const entry: recurringDb.RecurringEntry = {
        orgId,
        id,
        ...args,
        amount: Math.round(args.amount * 100),
        interval: 1,
        nextProcessDate: args.startDate,
        isActive: true,
        createdAt: new Date().toISOString()
      };
      await recurringDb.createRecurringEntry(entry, userId, userName, { ipAddress, userAgent });
      return `Recurring entry '${args.description}' created successfully.`;
    },
  }),

  delete_recurring_entry: tool({
    description: TOOL_SPECS.delete_recurring_entry.description,
    inputSchema: TOOL_SPECS.delete_recurring_entry.parameters,
    execute: async ({ id }) => {
      ensureCanMutate(role, isOwner);
      await recurringDb.deleteRecurringEntry(orgId, id, userId, userName, { ipAddress, userAgent });
      return `Recurring entry deleted.`;
    },
  }),
});
