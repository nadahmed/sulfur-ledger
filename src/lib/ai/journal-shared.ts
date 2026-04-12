import * as journalsDb from "../db/journals";
import * as accountsDb from "../db/accounts";
import * as tagsDb from "../db/tags";
import { randomUUID } from "crypto";

export interface SimplexJournalRecordingOptions {
  orgId: string;
  userId: string;
  userName: string;
  date: string;
  description: string;
  amount: number;
  fromAccountId: string;
  toAccountId: string;
  tags?: string[];
  prefix?: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Single source of truth for recording a "simplex" (From/To/Amount) journal entry.
 * Enforces:
 * - Both accounts must exist
 * - Neither account can be archived
 * - fromAccountId != toAccountId
 * - amount > 0
 * - Proper Paisa conversion
 */
export async function recordSimplexJournalEntry({
  orgId,
  userId,
  userName,
  date,
  description,
  amount,
  fromAccountId,
  toAccountId,
  tags,
  prefix = "[AI]",
  ipAddress,
  userAgent
}: SimplexJournalRecordingOptions) {
  // 1. Fetch accounts for validation
  const accs = await accountsDb.getAccounts(orgId);
  const accMap = new Map(accs.map((a: any) => [a.id, a]));

  const fromAcc = accMap.get(fromAccountId);
  const toAcc = accMap.get(toAccountId);

  // 2. Strict Validations
  if (!fromAcc) {
    throw new Error(`Account '${fromAccountId}' (Source) not found.`);
  }
  if (!toAcc) {
    throw new Error(`Account '${toAccountId}' (Destination) not found.`);
  }
  if (fromAcc.status === "archived") {
    throw new Error(`Account '${fromAccountId}' (${fromAcc.name}) is archived and cannot be used.`);
  }
  if (toAcc.status === "archived") {
    throw new Error(`Account '${toAccountId}' (${toAcc.name}) is archived and cannot be used.`);
  }
  if (fromAccountId === toAccountId) {
    throw new Error("Source and Destination accounts cannot be the same.");
  }

  // 2.5 Validate Tags (No Free Text)
  if (tags && tags.length > 0) {
    const formalTags = await tagsDb.getTags(orgId);
    const validTagIdentifiers = new Set<string>();
    formalTags.forEach(t => {
      validTagIdentifiers.add(t.id);
      validTagIdentifiers.add(t.name.toLowerCase());
    });

    for (const tag of tags) {
      if (!validTagIdentifiers.has(tag) && !validTagIdentifiers.has(tag.toLowerCase())) {
        throw new Error(`Tag '${tag}' is not a formal tag. Please create it first or use an existing one.`);
      }
    }
  }

  const amountPaisa = Math.round(amount * 100);
  if (amountPaisa <= 0) {
    throw new Error("Transaction amount must be greater than zero.");
  }

  // 3. Prepare Entry
  const id = randomUUID();
  const finalDate = date.slice(0, 10);

  const entry = {
    orgId,
    id,
    date: finalDate,
    description: prefix ? `${prefix} ${description}` : description,
    tags,
    createdAt: new Date().toISOString()
  };

  const lines = [
    { orgId, journalId: id, accountId: toAccountId, amount: amountPaisa, date: finalDate },    // Debit
    { orgId, journalId: id, accountId: fromAccountId, amount: -amountPaisa, date: finalDate }  // Credit
  ];

  // 4. Persistence
  await journalsDb.createJournalEntry(entry, lines, userId, userName, { ipAddress, userAgent });

  return {
    id,
    finalDate,
    fromAcc,
    toAcc,
    amount
  };
}
