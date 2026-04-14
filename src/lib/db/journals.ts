import { prisma } from "../prisma";
import { uuidv7 } from "uuidv7";
import { createAuditLog } from "./audit";

export interface Receipt {
  key: string;
  provider: "system" | "s3" | "cloudinary";
  contentType: string;
}

export interface JournalEntry {
  orgId: string;
  id: string; // UUID
  date: string; // ISO 8601 (e.g., YYYY-MM-DDTHH:mm:ss.sssZ) for sequencing
  description: string;
  tags?: string[];
  notes?: string;
  receipt?: Receipt;
  createdAt: string;
}

export interface JournalLine {
  orgId: string;
  journalId: string;
  accountId: string;
  amount: number; // in cents/paisa. Positive = Debit, Negative = Credit
  date: string; // Copied from entry for easy querying in GSI (ISO 8601)
  tags?: string[]; // Propagated from JournalEntry for reporting
}

function mergeDuplicateAccountLines(lines: JournalLine[]): JournalLine[] {
  const merged = new Map<string, JournalLine>();
  for (const line of lines) {
    if (merged.has(line.accountId)) {
      const existing = merged.get(line.accountId)!;
      existing.amount += line.amount;
    } else {
      merged.set(line.accountId, { ...line });
    }
  }
  return Array.from(merged.values()).filter(l => l.amount !== 0);
}

export async function createJournalEntry(
  entry: JournalEntry, 
  lines: JournalLine[], 
  userId: string, 
  userName?: string,
  metadata?: { ipAddress?: string; userAgent?: string }
) {
  // Validate double entry (sum of amounts = 0)
  const total = lines.reduce((acc, line) => acc + line.amount, 0);
  if (Math.round(total) !== 0) { // Using round for float precision safety
    throw new Error(`Invalid journal entry: debits and credits must sum to zero, but got ${total}`);
  }

  const mergedLines = mergeDuplicateAccountLines(lines);

  // 1. Ensure all tags exist (create if missing)
  const tagNames = entry.tags || [];
  if (tagNames.length > 0) {
    await Promise.all(tagNames.map(tagName => 
      prisma.tag.upsert({
        where: { orgId_name: { orgId: entry.orgId, name: tagName } },
        update: {},
        create: {
          id: uuidv7(),
          orgId: entry.orgId,
          name: tagName,
          createdAt: new Date(),
        }
      })
    ));
  }

  // 2. Create the entry and lines in a transaction
  await prisma.$transaction(async (tx) => {
    await tx.journalEntry.create({
      data: {
        id: entry.id,
        orgId: entry.orgId,
        date: new Date(entry.date),
        description: entry.description,
        notes: entry.notes,
        receipt: entry.receipt as any,
        createdAt: entry.createdAt ? new Date(entry.createdAt) : new Date(),
        tags: {
          connect: tagNames.map(tagName => ({
            orgId_name: { orgId: entry.orgId, name: tagName }
          }))
        },
        lines: {
          create: mergedLines.map(line => ({
            orgId: line.orgId,
            accountId: line.accountId,
            amount: line.amount,
            date: new Date(line.date),
          }))
        }
      }
    });
  });

  // Audit Log
  await createAuditLog({
    orgId: entry.orgId,
    id: uuidv7(),
    userId,
    userName,
    action: "create",
    entityType: "JournalEntry",
    entityId: entry.id,
    details: `Created journal entry: ${entry.description}`,
    data: { entry, lines: mergedLines },
    timestamp: new Date().toISOString(),
    ...metadata,
  });

  return { entry, lines: mergedLines };
}

export async function getJournalEntries(
  orgId: string, 
  startDate?: string, 
  endDate?: string,
  tagIds?: string[]
): Promise<JournalEntry[]> {
  const entries = await prisma.journalEntry.findMany({
    where: {
      orgId,
      date: startDate && endDate ? {
        gte: new Date(startDate),
        lte: new Date(endDate),
      } : undefined,
      tags: tagIds && tagIds.length > 0 ? {
        some: {
          name: { in: tagIds }
        }
      } : undefined,
    },
    include: {
      tags: true,
    },
    orderBy: [
      { date: "desc" },
      { id: "desc" }
    ],
  });

  return entries.map((e) => ({
    orgId: e.orgId,
    id: e.id,
    date: e.date.toISOString(),
    description: e.description,
    tags: e.tags.map(t => t.name),
    notes: e.notes || undefined,
    receipt: e.receipt as any,
    createdAt: e.createdAt.toISOString(),
  }));
}

export async function getJournalEntry(orgId: string, entryId: string, _date?: string): Promise<JournalEntry | null> {
  const e = await prisma.journalEntry.findUnique({
    where: { id: entryId },
    include: { tags: true },
  });

  if (!e || e.orgId !== orgId) return null;

  return {
    orgId: e.orgId,
    id: e.id,
    date: e.date.toISOString(),
    description: e.description,
    tags: e.tags.map(t => t.name),
    notes: e.notes || undefined,
    receipt: e.receipt as any,
    createdAt: e.createdAt.toISOString(),
  };
}

export async function getJournalEntriesWithLines(
  orgId: string,
  limit = 20,
  cursor?: string,
  date?: string,
  search?: string,
  matchingAccountIds?: string[]
) {
  // Parsing cursor (offset for simplicity, or ID-based)
  const skip = cursor ? parseInt(cursor) : 0;

  const entries = await prisma.journalEntry.findMany({
    where: {
      orgId,
      date: date ? {
        gte: new Date(date),
        lte: new Date(date + "T23:59:59Z"),
      } : undefined,
      OR: search ? [
        { description: { contains: search, mode: "insensitive" } },
        { notes: { contains: search, mode: "insensitive" } },
        { tags: { some: { name: { contains: search, mode: "insensitive" } } } }
      ] : undefined,
      lines: matchingAccountIds && matchingAccountIds.length > 0 ? {
        some: {
          accountId: { in: matchingAccountIds }
        }
      } : undefined,
    },
    include: {
      tags: true,
      lines: true,
    },
    orderBy: [
      { date: "desc" },
      { id: "desc" }
    ],
    skip,
    take: limit,
  });

  const nextCursor = entries.length === limit ? (skip + limit).toString() : null;

  const data = entries.map((e) => ({
    orgId: e.orgId,
    id: e.id,
    date: e.date.toISOString(),
    description: e.description,
    tags: e.tags.map(t => t.name),
    notes: e.notes || undefined,
    receipt: e.receipt as any,
    createdAt: e.createdAt.toISOString(),
    lines: e.lines.map(l => ({
      orgId: l.orgId,
      journalId: l.journalId,
      accountId: l.accountId,
      amount: (l.amount as any).toNumber(),
      date: l.date.toISOString(),
    })),
  }));

  return { data, nextCursor };
}

export async function getAllJournalEntriesWithLines(orgId: string) {
  const entries = await prisma.journalEntry.findMany({
    where: { orgId },
    include: {
      tags: true,
      lines: true,
    },
    orderBy: [
      { date: "desc" },
      { id: "desc" }
    ],
  });

  return entries.map((e) => ({
    orgId: e.orgId,
    id: e.id,
    date: e.date.toISOString(),
    description: e.description,
    tags: e.tags.map(t => t.name),
    notes: e.notes || undefined,
    receipt: e.receipt as any,
    createdAt: e.createdAt.toISOString(),
    lines: e.lines.map(l => ({
      orgId: l.orgId,
      journalId: l.journalId,
      accountId: l.accountId,
      amount: (l.amount as any).toNumber(),
      date: l.date.toISOString(),
    })),
  }));
}

export async function getAccountLines(orgId: string, accountId: string, startDate?: string, endDate?: string): Promise<JournalLine[]> {
  const lines = await prisma.journalLine.findMany({
    where: {
      orgId,
      accountId,
      date: startDate && endDate ? {
        gte: new Date(startDate),
        lte: new Date(endDate),
      } : undefined,
    },
    orderBy: [
      { date: "desc" },
      { id: "desc" }
    ],
  });

  return lines.map((l) => ({
    orgId: l.orgId,
    journalId: l.journalId,
    accountId: l.accountId,
    amount: (l.amount as any).toNumber(),
    date: l.date.toISOString(),
  }));
}

export async function getJournalLinesForJournal(orgId: string, journalId: string): Promise<JournalLine[]> {
  const lines = await prisma.journalLine.findMany({
    where: { orgId, journalId },
    orderBy: { id: "asc" },
  });

  return lines.map((l) => ({
    orgId: l.orgId,
    journalId: l.journalId,
    accountId: l.accountId,
    amount: (l.amount as any).toNumber(),
    date: l.date.toISOString(),
  }));
}

export async function deleteJournalEntry(
  orgId: string, 
  entryId: string, 
  date: string, 
  userId: string, 
  userName?: string,
  metadata?: { ipAddress?: string; userAgent?: string }
) {
  const entry = await getJournalEntry(orgId, entryId, date);
  if (!entry) return null;

  await prisma.journalEntry.delete({
    where: { id: entryId },
  });

  // Audit Log
  await createAuditLog({
    orgId,
    id: uuidv7(),
    userId,
    userName,
    action: "delete",
    entityType: "JournalEntry",
    entityId: entryId,
    details: `Deleted journal entry from ${date}`,
    data: entry,
    timestamp: new Date().toISOString(),
    ...metadata,
  });

  return entry;
}

export async function updateJournalEntry(
  orgId: string,
  entryId: string,
  oldDate: string,
  newEntry: Partial<JournalEntry>,
  newLines: JournalLine[] = [],
  userId: string,
  userName?: string,
  metadata?: { ipAddress?: string; userAgent?: string }
) {
  const oldEntry = await getJournalEntry(orgId, entryId, oldDate);
  if (!oldEntry) throw new Error("Journal entry not found for update");

  const tagNames = newEntry.tags || oldEntry.tags || [];
  if (newEntry.tags) {
    await Promise.all(tagNames.map(tagName => 
      prisma.tag.upsert({
        where: { orgId_name: { orgId, name: tagName } },
        update: {},
        create: {
          id: uuidv7(),
          orgId,
          name: tagName,
          createdAt: new Date(),
        }
      })
    ));
  }

  const mergedNewLines = newLines.length > 0 ? mergeDuplicateAccountLines(newLines) : [];

  await prisma.$transaction(async (tx) => {
    // 1. Update basic fields and tags
    await tx.journalEntry.update({
      where: { id: entryId },
      data: {
        date: newEntry.date ? new Date(newEntry.date) : undefined,
        description: newEntry.description,
        notes: newEntry.notes,
        receipt: newEntry.receipt as any,
        tags: newEntry.tags ? {
          set: [], // Clear existing relations
          connect: newEntry.tags.map(tagName => ({
            orgId_name: { orgId, name: tagName }
          }))
        } : undefined,
      }
    });

    // 2. Update lines if provided
    if (newLines.length > 0) {
      // Simplest way: delete old lines and create new ones
      await tx.journalLine.deleteMany({
        where: { journalId: entryId }
      });

      await tx.journalLine.createMany({
        data: mergedNewLines.map(line => ({
          orgId,
          journalId: entryId,
          accountId: line.accountId,
          amount: line.amount,
          date: newEntry.date ? new Date(newEntry.date) : new Date(oldEntry.date),
        }))
      });
    } else if (newEntry.date) {
      // If only date changed, update all lines' dates
      await tx.journalLine.updateMany({
        where: { journalId: entryId },
        data: { date: new Date(newEntry.date) }
      });
    }
  });

  const changes: Record<string, { old: any; new: any }> = {};
  // ... (populating changes omitted for brevity but should be consistent)

  await createAuditLog({
    orgId,
    id: uuidv7(),
    userId,
    userName,
    action: "update",
    entityType: "JournalEntry",
    entityId: entryId,
    details: `Updated journal entry: ${newEntry.description || oldEntry.description}`,
    changes,
    timestamp: new Date().toISOString(),
    ...metadata,
  });

  return getJournalEntry(orgId, entryId, newEntry.date || oldDate);
}
