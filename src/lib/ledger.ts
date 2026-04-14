/**
 * @module LedgerService
 *
 * Single source of truth for all ledger business logic.
 * Handles: UUID7 generation, date normalization, amount normalization,
 * double-entry validation, account status guards, and audit logging.
 *
 * RBAC lives in the API routes and AI tool definitions — NOT here.
 * Callers must enforce permission checks before invoking mutating methods.
 */

import { uuidv7 } from "uuidv7";
import * as accountsDb from "./db/accounts";
import * as tagsDb from "./db/tags";
import * as journalsDb from "./db/journals";
import { generateReportData } from "./reports";
import { normalizeDate, normalizeAmount } from "./utils";

// ─── Shared Types ────────────────────────────────────────────────────────────

export interface UserContext {
  userId: string;
  userName?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface SimplexJournalInput {
  date: string;
  description: string;
  /** Positive decimal amount (e.g. 100.50) */
  amount: number;
  /** Account money flows FROM (Credit) */
  fromAccountId: string;
  /** Account money flows TO (Debit) */
  toAccountId: string;
  tags?: string[];
  notes?: string;
  receipt?: journalsDb.Receipt;
}

export interface ReportOptions {
  startDate?: string;
  endDate?: string;
  tagIds?: string[];
  searchParams?: URLSearchParams;
}

// ─── ACCOUNTS ────────────────────────────────────────────────────────────────

export const accounts = {
  /**
   * List all accounts for an org.
   */
  async getAll(orgId: string) {
    return accountsDb.getAccounts(orgId);
  },

  /**
   * Create a brand-new account with a caller-supplied slug ID.
   * The DB layer enforces uniqueness via a ConditionExpression.
   */
  async create(
    orgId: string,
    data: { id: string; name: string; category: accountsDb.AccountCategory },
    ctx: UserContext
  ) {
    const account: accountsDb.Account = {
      orgId,
      id: data.id,
      name: data.name,
      category: data.category,
      status: "active",
      createdAt: new Date().toISOString(),
    };
    return accountsDb.createAccount(account, ctx.userId, ctx.userName, {
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
  },

  /** Rename an account. */
  async rename(orgId: string, accountId: string, name: string, ctx: UserContext) {
    return accountsDb.updateAccountName(orgId, accountId, name, ctx.userId, ctx.userName, {
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
  },

  /** Archive an account (soft-delete). */
  async archive(orgId: string, accountId: string, ctx: UserContext) {
    return accountsDb.archiveAccount(orgId, accountId, ctx.userId, ctx.userName, {
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
  },

  /** Restore an archived account. */
  async unarchive(orgId: string, accountId: string, ctx: UserContext) {
    return accountsDb.unarchiveAccount(orgId, accountId, ctx.userId, ctx.userName, {
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
  },

  /** Hard-delete an account (use with caution; prefer archive for auditability). */
  async delete(orgId: string, accountId: string, ctx: UserContext) {
    return accountsDb.deleteAccount(orgId, accountId, ctx.userId, ctx.userName, {
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
  },
};

// ─── TAGS ────────────────────────────────────────────────────────────────────

export const tags = {
  async getAll(orgId: string) {
    return tagsDb.getTags(orgId);
  },

  async create(
    orgId: string,
    data: { name: string; color: string; description?: string },
    ctx: UserContext
  ) {
    return tagsDb.createTag({ orgId, ...data }, ctx.userId, ctx.userName, {
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
  },

  async update(
    orgId: string,
    tagId: string,
    data: Partial<{ name: string; color: string; description: string }>,
    _ctx: UserContext
  ) {
    return tagsDb.updateTag(orgId, tagId, data);
  },

  async delete(orgId: string, tagId: string, ctx: UserContext) {
    return tagsDb.deleteTag(orgId, tagId, ctx.userId, ctx.userName, {
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
  },
};

// ─── JOURNALS ────────────────────────────────────────────────────────────────

export const journals = {
  /**
   * List journal entries with their lines.
   */
  async getAll(
    orgId: string,
    opts?: { limit?: number; cursor?: string; date?: string; search?: string; matchingAccountIds?: string[] }
  ) {
    return journalsDb.getJournalEntriesWithLines(
      orgId,
      opts?.limit ?? 20,
      opts?.cursor,
      opts?.date,
      opts?.search,
      opts?.matchingAccountIds
    );
  },

  /**
   * Get a single journal entry with its lines.
   */
  async get(orgId: string, entryId: string, date?: string) {
    return journalsDb.getJournalEntry(orgId, entryId, date);
  },

  /**
   * Record a "simplex" journal entry (From/To/Amount).
   *
   * Business invariants enforced here:
   *  - amount > 0
   *  - fromAccountId !== toAccountId
   *  - both accounts must exist and be active
   *  - tags must be valid UUIDs (validated by caller where AI is driving; skipped for direct API calls)
   *
   * UUID7 and date normalization are applied automatically.
   */
  async record(orgId: string, input: SimplexJournalInput, ctx: UserContext) {
    // 1. Normalize date and amount
    const date = normalizeDate(input.date);
    const amountPaisa = normalizeAmount(input.amount);

    if (amountPaisa <= 0) {
      throw new Error("Amount must be a positive number greater than zero.");
    }
    if (input.fromAccountId === input.toAccountId) {
      throw new Error("Source and Destination accounts cannot be the same.");
    }

    // 2. Validate accounts
    const allAccounts = await accountsDb.getAccounts(orgId);
    const accMap = new Map(allAccounts.map((a) => [a.id, a]));

    const fromAcc = accMap.get(input.fromAccountId);
    const toAcc = accMap.get(input.toAccountId);

    if (!fromAcc) throw new Error(`Account '${input.fromAccountId}' not found.`);
    if (!toAcc) throw new Error(`Account '${input.toAccountId}' not found.`);
    if (fromAcc.status === "archived") {
      throw new Error(`Account '${fromAcc.name}' is archived and cannot be used.`);
    }
    if (toAcc.status === "archived") {
      throw new Error(`Account '${toAcc.name}' is archived and cannot be used.`);
    }

    // 3. Build entry (UUID7 generated here — never in the caller)
    const id = uuidv7();
    const entry: journalsDb.JournalEntry = {
      orgId,
      id,
      date,
      description: input.description,
      tags: input.tags,
      notes: input.notes,
      receipt: input.receipt,
      createdAt: new Date().toISOString(),
    };

    const lines: journalsDb.JournalLine[] = [
      { orgId, journalId: id, accountId: input.toAccountId, amount: amountPaisa, date },
      { orgId, journalId: id, accountId: input.fromAccountId, amount: -amountPaisa, date },
    ];

    // 4. Persist (double-entry validation happens inside createJournalEntry)
    await journalsDb.createJournalEntry(entry, lines, ctx.userId, ctx.userName, {
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return { id, date, fromAcc, toAcc, amount: input.amount };
  },

  /**
   * Update an existing journal entry (date, description, amount, accounts, tags).
   */
  async update(
    orgId: string,
    entryId: string,
    oldDate: string,
    patch: {
      date?: string;
      description?: string;
      amount?: number;
      fromAccountId?: string;
      toAccountId?: string;
      tags?: string[];
      receipt?: journalsDb.Receipt;
    },
    ctx: UserContext
  ) {
    const newDate = patch.date ? normalizeDate(patch.date) : undefined;

    let newLines: journalsDb.JournalLine[] = [];
    if (patch.amount !== undefined || patch.fromAccountId || patch.toAccountId) {
      // Re-fetch existing entry and its lines to fill in missing patch fields
      const existing = await journalsDb.getJournalEntry(orgId, entryId, oldDate);
      if (!existing) throw new Error("Journal entry not found.");

      const existingLines = await journalsDb.getJournalLinesForJournal(orgId, entryId);
      // Debit line (positive amount) is the "to" account; credit (negative) is the "from" account
      const existingToLine   = existingLines.find((l) => l.amount > 0);
      const existingFromLine = existingLines.find((l) => l.amount < 0);
      const existingToId   = existingToLine?.accountId;
      const existingFromId = existingFromLine?.accountId;

      const fromId = patch.fromAccountId ?? existingFromId;
      const toId   = patch.toAccountId   ?? existingToId;

      if (!fromId || !toId) throw new Error("Cannot resolve account IDs for update.");

      const amount = patch.amount !== undefined ? normalizeAmount(patch.amount) : Math.abs(existingToLine?.amount ?? 0);

      if (amount > 0) {
        const date = newDate ?? normalizeDate(existing.date);
        newLines = [
          { orgId, journalId: entryId, accountId: toId,   amount,  date },
          { orgId, journalId: entryId, accountId: fromId, amount: -amount, date },
        ];
      }
    }

    return journalsDb.updateJournalEntry(
      orgId,
      entryId,
      normalizeDate(oldDate),
      {
        ...(newDate ? { date: newDate } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
        ...(patch.receipt !== undefined ? { receipt: patch.receipt } : {}),
      },
      newLines,
      ctx.userId,
      ctx.userName,
      { ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
    );
  },

  /**
   * Delete a journal entry and all its lines.
   */
  async delete(orgId: string, entryId: string, date: string, ctx: UserContext) {
    return journalsDb.deleteJournalEntry(
      orgId,
      entryId,
      normalizeDate(date),
      ctx.userId,
      ctx.userName,
      { ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
    );
  },

  /**
   * Retrieve all entries with lines (used for bulk export).
   */
  async getAll_export(orgId: string) {
    return journalsDb.getAllJournalEntriesWithLines(orgId);
  },
};

// ─── REPORTS ─────────────────────────────────────────────────────────────────

export const reports = {
  /**
   * Generate any supported report type.
   * Valid types: "trial-balance" | "balance-sheet" | "income-statement" | "summary" | "dashboard" | "trend"
   */
  async get(
    orgId: string,
    reportType: string,
    opts: ReportOptions = {}
  ) {
    return generateReportData(
      orgId,
      reportType,
      opts.startDate,
      opts.endDate,
      opts.searchParams,
      opts.tagIds
    );
  },
};

// ─── IMPORT ──────────────────────────────────────────────────────────────────

/**
 * Record a journal entry during a bulk import.
 * Accepts a pre-normalized entry object (date in YYYY-MM-DD, amount in paisa).
 * All accounts must already exist; this function does NOT auto-create them.
 */
export async function recordImportEntry(
  orgId: string,
  entryData: {
    id?: string;
    date: string;
    description: string;
    toAccountId: string;
    fromAccountId: string;
    amountPaisa: number;
    tags?: string[];
    notes?: string;
  },
  ctx: UserContext
) {
  const id = entryData.id ?? uuidv7();
  const date = normalizeDate(entryData.date);

  const entry: journalsDb.JournalEntry = {
    orgId,
    id,
    date,
    description: entryData.description,
    tags: entryData.tags,
    notes: entryData.notes,
    createdAt: new Date().toISOString(),
  };

  const lines: journalsDb.JournalLine[] = [
    { orgId, journalId: id, accountId: entryData.toAccountId, amount: entryData.amountPaisa, date },
    { orgId, journalId: id, accountId: entryData.fromAccountId, amount: -entryData.amountPaisa, date },
  ];

  await journalsDb.createJournalEntry(entry, lines, ctx.userId, ctx.userName, {
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return id;
}
