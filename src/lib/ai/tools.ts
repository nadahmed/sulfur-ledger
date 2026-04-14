import { tool } from "ai";
import * as LedgerService from "../ledger";
import * as recurringDb from "../db/recurring";
import { uuidv7 } from "uuidv7";
import { TOOL_SPECS } from "./tool-definitions";
import { recordSimplexJournalEntry } from "./journal-shared";

/**
 * RBAC guard — enforced at the tool level (outside the service layer).
 * This mirrors the API-level guards, but for AI/MCP callers.
 */
const ensureCanMutate = (role: string, isOwner: boolean) => {
  if (role === "viewer") throw new Error("Forbidden: Viewers cannot perform this action.");
  if (isOwner || role === "admin" || role === "member") return true;
  throw new Error("Forbidden: Insufficient permissions.");
};

export const createAiTools = (
  orgId: string,
  userId: string,
  userName: string,
  role: string,
  isOwner: boolean,
  ipAddress?: string,
  userAgent?: string
) => {
  const ctx: LedgerService.UserContext = { userId, userName, ipAddress, userAgent };

  return {
    // ── ACCOUNTS ─────────────────────────────────────────────────────────────
    get_accounts: tool({
      description: TOOL_SPECS.get_accounts.description,
      inputSchema: TOOL_SPECS.get_accounts.parameters,
      execute: async () => {
        const accs = await LedgerService.accounts.getAll(orgId);
        return accs.map((a) => ({ id: a.id, name: a.name, category: a.category, status: a.status }));
      },
    }),

    create_account: tool({
      description: TOOL_SPECS.create_account.description,
      inputSchema: TOOL_SPECS.create_account.parameters,
      execute: async ({ id, name, category }: { id: string; name: string; category: any }) => {
        ensureCanMutate(role, isOwner);
        await LedgerService.accounts.create(orgId, { id, name, category }, ctx);
        return `Account '${name}' created successfully.`;
      },
    }),

    // ── TAGS ─────────────────────────────────────────────────────────────────
    get_tags: tool({
      description: TOOL_SPECS.get_tags.description,
      inputSchema: TOOL_SPECS.get_tags.parameters,
      execute: async () => {
        const tags = await LedgerService.tags.getAll(orgId);
        return tags.map((t) => ({ id: t.id, name: t.name, color: t.color }));
      },
    }),

    create_tag: tool({
      description: TOOL_SPECS.create_tag.description,
      inputSchema: TOOL_SPECS.create_tag.parameters,
      execute: async (args: { name: string; color: string; description?: string }) => {
        ensureCanMutate(role, isOwner);
        const tag = await LedgerService.tags.create(orgId, args, ctx);
        return `Tag '${tag.name}' created with ID ${tag.id}.`;
      },
    }),

    // ── JOURNALS ─────────────────────────────────────────────────────────────
    get_journals: tool({
      description: TOOL_SPECS.get_journals.description,
      inputSchema: TOOL_SPECS.get_journals.parameters,
      execute: async ({ startDate, endDate, tagIds }: { startDate?: string; endDate?: string; tagIds?: string[] }) => {
        const { getJournalEntries } = await import("../db/journals");
        const { getJournalLinesForJournal } = await import("../db/journals");
        const entries = await getJournalEntries(orgId, startDate, endDate, tagIds);
        const enriched = await Promise.all(
          entries.map(async (e) => {
            const lines = await getJournalLinesForJournal(orgId, e.id);
            return {
              id: e.id,
              date: e.date.slice(0, 10),
              description: e.description,
              tags: e.tags ?? [],
              lines: lines.map((l: any) => ({ accountId: l.accountId, amount: l.amount / 100 })),
            };
          })
        );
        return enriched;
      },
    }),

    record_journal_entry: tool({
      description: TOOL_SPECS.record_journal_entry.description,
      inputSchema: TOOL_SPECS.record_journal_entry.parameters,
      execute: async ({ date, description, amount, fromAccountId, toAccountId, tags }: any) => {
        ensureCanMutate(role, isOwner);
        const res = await recordSimplexJournalEntry({
          orgId, userId, userName, date, description, amount,
          fromAccountId, toAccountId, tags, ipAddress, userAgent,
        });
        return `✅ Recorded: ${description} (${res.amount.toFixed(2)})`;
      },
    }),

    record_bulk_journal_entries: tool({
      description: TOOL_SPECS.record_bulk_journal_entries.description,
      inputSchema: TOOL_SPECS.record_bulk_journal_entries.parameters,
      execute: async ({ entries }: { entries: any[] }) => {
        ensureCanMutate(role, isOwner);
        const results: string[] = [];
        for (const entry of entries) {
          const res = await recordSimplexJournalEntry({
            orgId, userId, userName, ...entry,
            prefix: "[AI-Bulk]", ipAddress, userAgent,
          });
          results.push(`✅ ${entry.description} (${res.amount.toFixed(2)})`);
        }
        return `Processed ${entries.length} entries:\n${results.join("\n")}`;
      },
    }),

    // ── REPORTS ──────────────────────────────────────────────────────────────
    get_account_balance: tool({
      description: TOOL_SPECS.get_account_balance.description,
      inputSchema: TOOL_SPECS.get_account_balance.parameters,
      execute: async ({ accountId, startDate, endDate }: any) => {
        const report = (await LedgerService.reports.get(orgId, "trial-balance", { startDate, endDate })) as any;
        const acc = report.accounts?.find((a: any) => a.id === accountId);
        if (!acc) return `Account '${accountId}' not found in report.`;
        return `Canonical balance for '${accountId}': ${(acc.balance / 100).toFixed(2)}`;
      },
    }),

    get_financial_summary: tool({
      description: TOOL_SPECS.get_financial_summary.description,
      inputSchema: TOOL_SPECS.get_financial_summary.parameters,
      execute: async ({ startDate, endDate }: any) => {
        const report = (await LedgerService.reports.get(orgId, "income-statement", { startDate, endDate })) as any;
        const totalIncome = (report.income || []).reduce((s: number, i: any) => s + Math.abs(i.balance), 0);
        const totalExpenses = (report.expenses || []).reduce((s: number, i: any) => s + Math.abs(i.balance), 0);
        return {
          income: totalIncome / 100,
          expenses: totalExpenses / 100,
          net: (totalIncome - totalExpenses) / 100,
          period: `${startDate || "start"} to ${endDate || "now"}`,
        };
      },
    }),

    get_financial_report: tool({
      description: TOOL_SPECS.get_financial_report.description,
      inputSchema: TOOL_SPECS.get_financial_report.parameters,
      execute: async ({ reportType, startDate, endDate, tagIds }: any) => {
        const report = (await LedgerService.reports.get(orgId, reportType, { startDate, endDate, tagIds })) as any;
        const toUnit = (a: any) => ({ ...a, balance: a.balance / 100 });
        if (report.accounts)     report.accounts     = report.accounts.map(toUnit);
        if (report.assets)       report.assets       = report.assets.map(toUnit);
        if (report.liabilities)  report.liabilities  = report.liabilities.map(toUnit);
        if (report.equity)       report.equity       = report.equity.map(toUnit);
        if (report.income)       report.income       = report.income.map(toUnit);
        if (report.expenses)     report.expenses     = report.expenses.map(toUnit);
        if (report.totalDebits)  report.totalDebits  = report.totalDebits / 100;
        if (report.totalCredits) report.totalCredits = report.totalCredits / 100;
        return report;
      },
    }),

    // ── RECURRING ────────────────────────────────────────────────────────────
    get_recurring_entries: tool({
      description: TOOL_SPECS.get_recurring_entries.description,
      inputSchema: TOOL_SPECS.get_recurring_entries.parameters,
      execute: async () => {
        const entries = await recurringDb.getRecurringEntries(orgId);
        return entries.map((e) => ({
          id: e.id,
          description: e.description,
          amount: e.amount / 100,
          frequency: e.frequency,
          nextDate: e.nextProcessDate,
          isActive: e.isActive,
        }));
      },
    }),

    create_recurring_entry: tool({
      description: TOOL_SPECS.create_recurring_entry.description,
      inputSchema: TOOL_SPECS.create_recurring_entry.parameters,
      execute: async (args: any) => {
        ensureCanMutate(role, isOwner);
        const id = uuidv7();
        const entry: recurringDb.RecurringEntry = {
          orgId, id, ...args,
          amount: Math.round(args.amount * 100),
          interval: 1,
          nextProcessDate: args.startDate,
          isActive: true,
          createdAt: new Date().toISOString(),
        };
        await recurringDb.createRecurringEntry(entry, userId, userName, { ipAddress, userAgent });
        return `Recurring entry '${args.description}' created successfully.`;
      },
    }),

    delete_recurring_entry: tool({
      description: TOOL_SPECS.delete_recurring_entry.description,
      inputSchema: TOOL_SPECS.delete_recurring_entry.parameters,
      execute: async ({ id }: { id: string }) => {
        ensureCanMutate(role, isOwner);
        await recurringDb.deleteRecurringEntry(orgId, id, userId, userName, { ipAddress, userAgent });
        return `Recurring entry deleted.`;
      },
    }),
  };
};
