import { prisma } from "../prisma";
import { createAuditLog } from "./audit";
import { uuidv7 } from "uuidv7";

export type RecurringFrequency = "daily" | "weekly" | "monthly" | "yearly";

export interface RecurringEntry {
  orgId: string;
  id: string;
  description: string;
  amount: number; // in cents
  fromAccountId: string;
  toAccountId: string;
  frequency: RecurringFrequency;
  interval: number;
  dayOfWeek?: number; // 0-6
  dayOfMonth?: number; // 1-31
  startDate: string; // YYYY-MM-DD
  lastProcessedDate?: string;
  nextProcessDate: string;
  tags?: string[];
  isActive: boolean;
  createdAt: string;
}

export async function createRecurringEntry(
  entry: RecurringEntry, 
  userId?: string, 
  userName?: string,
  metadata?: { ipAddress?: string; userAgent?: string }
) {
  await prisma.recurringEntry.create({
    data: {
      id: entry.id,
      orgId: entry.orgId,
      description: entry.description,
      amount: entry.amount,
      fromAccountId: entry.fromAccountId,
      toAccountId: entry.toAccountId,
      frequency: entry.frequency,
      interval: entry.interval,
      dayOfWeek: entry.dayOfWeek,
      dayOfMonth: entry.dayOfMonth,
      startDate: new Date(entry.startDate),
      lastProcessedDate: entry.lastProcessedDate ? new Date(entry.lastProcessedDate) : null,
      nextProcessDate: new Date(entry.nextProcessDate),
      isActive: entry.isActive,
      createdAt: entry.createdAt ? new Date(entry.createdAt) : new Date(),
    },
  });

  if (userId) {
    await createAuditLog({
      orgId: entry.orgId,
      id: uuidv7(),
      userId,
      userName,
      action: "create",
      entityType: "RecurringEntry",
      entityId: entry.id,
      details: `Created recurring entry: ${entry.description}`,
      data: entry,
      timestamp: new Date().toISOString(),
      ...metadata,
    });
  }

  return entry;
}

export async function getRecurringEntries(orgId: string): Promise<RecurringEntry[]> {
  const items = await prisma.recurringEntry.findMany({
    where: { orgId },
    orderBy: { createdAt: "desc" },
  });
  return items.map(item => ({
    ...item,
    amount: (item.amount as any).toNumber(),
    startDate: item.startDate.toISOString().slice(0, 10),
    lastProcessedDate: item.lastProcessedDate?.toISOString(),
    nextProcessDate: item.nextProcessDate.toISOString(),
    createdAt: item.createdAt.toISOString(),
    frequency: item.frequency as RecurringFrequency,
    dayOfWeek: item.dayOfWeek ?? undefined,
    dayOfMonth: item.dayOfMonth ?? undefined,
  }));
}

export async function getRecurringEntry(orgId: string, id: string): Promise<RecurringEntry | null> {
  const item = await prisma.recurringEntry.findUnique({
    where: { id },
  });
  if (!item || item.orgId !== orgId) return null;
  return {
    ...item,
    amount: (item.amount as any).toNumber(),
    startDate: item.startDate.toISOString().slice(0, 10),
    lastProcessedDate: item.lastProcessedDate?.toISOString(),
    nextProcessDate: item.nextProcessDate.toISOString(),
    createdAt: item.createdAt.toISOString(),
    frequency: item.frequency as RecurringFrequency,
    dayOfWeek: item.dayOfWeek ?? undefined,
    dayOfMonth: item.dayOfMonth ?? undefined,
  };
}

export async function updateRecurringEntry(
  orgId: string, 
  id: string, 
  updates: Partial<RecurringEntry>, 
  userId?: string, 
  userName?: string,
  metadata?: { ipAddress?: string; userAgent?: string }
) {
  const oldEntry = await getRecurringEntry(orgId, id);
  if (!oldEntry) throw new Error("Recurring entry not found");

  await prisma.recurringEntry.update({
    where: { id },
    data: {
      description: updates.description,
      amount: updates.amount,
      fromAccountId: updates.fromAccountId,
      toAccountId: updates.toAccountId,
      frequency: updates.frequency,
      interval: updates.interval,
      dayOfWeek: updates.dayOfWeek,
      dayOfMonth: updates.dayOfMonth,
      startDate: updates.startDate ? new Date(updates.startDate) : undefined,
      lastProcessedDate: updates.lastProcessedDate ? new Date(updates.lastProcessedDate) : undefined,
      nextProcessDate: updates.nextProcessDate ? new Date(updates.nextProcessDate) : undefined,
      isActive: updates.isActive,
    },
  });

  if (userId) {
    const changes: Record<string, { old: any; new: any }> = {};
    Object.entries(updates).forEach(([key, value]) => {
      if ((oldEntry as any)[key] !== value) {
        changes[key] = { old: (oldEntry as any)[key], new: value };
      }
    });

    await createAuditLog({
      orgId,
      id: uuidv7(),
      userId,
      userName,
      action: "update",
      entityType: "RecurringEntry",
      entityId: id,
      details: `Updated recurring entry: ${id}`,
      changes,
      timestamp: new Date().toISOString(),
      ...metadata,
    });
  }
}

export async function deleteRecurringEntry(
  orgId: string, 
  id: string, 
  userId?: string, 
  userName?: string,
  metadata?: { ipAddress?: string; userAgent?: string }
) {
  const oldEntry = await getRecurringEntry(orgId, id);
  
  await prisma.recurringEntry.delete({
    where: { id },
  });

  if (userId) {
    await createAuditLog({
      orgId,
      id: uuidv7(),
      userId,
      userName,
      action: "delete",
      entityType: "RecurringEntry",
      entityId: id,
      details: `Deleted recurring entry: ${oldEntry?.description || id}`,
      data: oldEntry,
      timestamp: new Date().toISOString(),
      ...metadata,
    });
  }
}

export async function getRecurringEntriesByAccount(orgId: string, accountId: string): Promise<RecurringEntry[]> {
  const items = await prisma.recurringEntry.findMany({
    where: {
      orgId,
      OR: [
        { fromAccountId: accountId },
        { toAccountId: accountId },
      ],
    },
  });
  return items.map(item => ({
    ...item,
    amount: (item.amount as any).toNumber(),
    startDate: item.startDate.toISOString().slice(0, 10),
    lastProcessedDate: item.lastProcessedDate?.toISOString(),
    nextProcessDate: item.nextProcessDate.toISOString(),
    createdAt: item.createdAt.toISOString(),
    frequency: item.frequency as RecurringFrequency,
    dayOfWeek: item.dayOfWeek ?? undefined,
    dayOfMonth: item.dayOfMonth ?? undefined,
  }));
}
