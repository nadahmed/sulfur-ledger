import { addDays, addWeeks, addMonths, addYears, format, parseISO } from "date-fns";
import { uuidv7 } from "uuidv7";
import { prisma } from "./prisma";
import { createAuditLog } from "./db/audit";

export async function processDueRecurringEntries() {
  const today = new Date();

  const dueEntries = await prisma.recurringEntry.findMany({
    where: {
      isActive: true,
      nextProcessDate: {
        lte: today,
      },
    },
  });

  const results = { processed: 0, errors: 0 };

  for (const entry of dueEntries) {
    try {
      await processSingleRecurringEntry(entry);
      results.processed++;
    } catch (error) {
      console.error(`Error processing recurring entry ${entry.id}:`, error);
      results.errors++;
    }
  }

  return results;
}

async function processSingleRecurringEntry(entry: any) {
  const journalId = uuidv7();
  const todayDate = new Date();
  
  const amount = (entry.amount as any).toNumber();
  
  // Calculate next process date
  const nextDate = calculateNextOccurrence(entry.nextProcessDate, entry.frequency, entry.interval);

  // Use a Prisma transaction to ensure atomicity
  await prisma.$transaction(async (tx) => {
    // 1. Create Journal Entry
    const journal = await tx.journalEntry.create({
      data: {
        id: journalId,
        orgId: entry.orgId,
        date: todayDate,
        description: `[Recurring] ${entry.description}`,
        notes: `Source: recurring, ID: ${entry.id}`,
      },
    });

    // 2. Create Journal Lines
    await tx.journalLine.createMany({
      data: [
        {
          id: uuidv7(),
          orgId: entry.orgId,
          journalId,
          accountId: entry.toAccountId,
          amount: amount,
          date: todayDate,
        },
        {
          id: uuidv7(),
          orgId: entry.orgId,
          journalId,
          accountId: entry.fromAccountId,
          amount: -amount,
          date: todayDate,
        },
      ],
    });

    // 3. Update Recurring Entry
    await tx.recurringEntry.update({
      where: { id: entry.id },
      data: {
        lastProcessedDate: todayDate,
        nextProcessDate: nextDate,
      },
    });
  });

  // Audit Log
  await createAuditLog({
    orgId: entry.orgId,
    id: uuidv7(),
    userId: "system",
    userName: "System (Recurring)",
    action: "create",
    entityType: "JournalEntry",
    entityId: journalId,
    details: JSON.stringify({ description: `[Recurring] ${entry.description}`, source: "recurring", recurringId: entry.id }),
    timestamp: new Date().toISOString(),
  });
}

function calculateNextOccurrence(currentDate: Date, frequency: string, interval: number): Date {
  const date = currentDate;
  let nextDate: Date;

  switch (frequency) {
    case "daily":
      nextDate = addDays(date, interval);
      break;
    case "weekly":
      nextDate = addWeeks(date, interval);
      break;
    case "monthly":
      nextDate = addMonths(date, interval);
      break;
    case "yearly":
      nextDate = addYears(date, interval);
      break;
    default:
      nextDate = addMonths(date, interval);
  }

  return nextDate;
}
