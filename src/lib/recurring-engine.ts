import { addDays, addWeeks, addMonths, addYears, format, parseISO } from "date-fns";
import { uuidv7 } from "uuidv7";
import { db, TABLE_NAME } from "./dynamodb";
import { TransactWriteItemsCommand } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { createAuditLog } from "./db/audit";

export async function processDueRecurringEntries() {
  const today = format(new Date(), "yyyy-MM-dd");

  const result = await db.send(
    new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: "#type = :type AND isActive = :active AND nextProcessDate <= :today",
      ExpressionAttributeNames: { "#type": "Type" },
      ExpressionAttributeValues: {
        ":type": "RecurringEntry",
        ":active": true,
        ":today": today,
      },
    })
  );

  const dueEntries = (result.Items as any[]) || [];
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
  const today = format(new Date(), "yyyy-MM-dd");
  
  const amountPaisa = entry.amount;
  const journalEntry = {
    orgId: entry.orgId,
    id: journalId,
    date: today,
    description: `[Recurring] ${entry.description}`,
    tags: entry.tags,
    createdAt: new Date().toISOString(),
  };

  const journalLines = [
    { orgId: entry.orgId, journalId, accountId: entry.toAccountId, amount: amountPaisa, date: today },
    { orgId: entry.orgId, journalId, accountId: entry.fromAccountId, amount: -amountPaisa, date: today },
  ];

  // Calculate next process date
  const nextDate = calculateNextOccurrence(entry.nextProcessDate, entry.frequency, entry.interval);

  // Use a transaction to create journal and update recurring entry
  
  const transactItems: any[] = [
    // 1. Create Journal Entry
    {
      Put: {
        TableName: TABLE_NAME,
        Item: marshall({
          PK: `ORG#${entry.orgId}#JOURNAL`,
          SK: `JNL#${today}#${journalId}`,
          Type: "JournalEntry",
          ...journalEntry,
        }, { removeUndefinedValues: true }),
      },
    },
    // 2. Create Journal Line (Debit)
    {
      Put: {
        TableName: TABLE_NAME,
        Item: marshall({
          PK: `ORG#${entry.orgId}#JOURNAL`,
          SK: `LINE#${journalId}#${entry.toAccountId}`,
          Type: "JournalLine",
          GSI1PK: `ORG#${entry.orgId}#ACC#${entry.toAccountId}`,
          GSI1SK: `JNL#${today}#${journalId}`,
          tags: entry.tags,
          ...journalLines[0],
        }, { removeUndefinedValues: true }),
      },
    },
    // 3. Create Journal Line (Credit)
    {
      Put: {
        TableName: TABLE_NAME,
        Item: marshall({
          PK: `ORG#${entry.orgId}#JOURNAL`,
          SK: `LINE#${journalId}#${entry.fromAccountId}`,
          Type: "JournalLine",
          GSI1PK: `ORG#${entry.orgId}#ACC#${entry.fromAccountId}`,
          GSI1SK: `JNL#${today}#${journalId}`,
          tags: entry.tags,
          ...journalLines[1],
        }, { removeUndefinedValues: true }),
      },
    },
    // 4. Update Recurring Entry
    {
      Update: {
        TableName: TABLE_NAME,
        Key: marshall({
          PK: `ORG#${entry.orgId}#RECURRING`,
          SK: `REC#${entry.id}`,
        }),
        UpdateExpression: "SET lastProcessedDate = :today, nextProcessDate = :nextDate",
        ExpressionAttributeValues: marshall({
          ":today": today,
          ":nextDate": nextDate,
        }),
      },
    },
  ];

  await db.send(new TransactWriteItemsCommand({ TransactItems: transactItems }));

  // Audit Log
  await createAuditLog({
    orgId: entry.orgId,
    id: uuidv7(),
    userId: "system",
    userName: "System (Recurring)",
    action: "create",
    entityType: "JournalEntry",
    entityId: journalId,
    details: JSON.stringify({ description: journalEntry.description, source: "recurring", recurringId: entry.id }),
    timestamp: new Date().toISOString(),
  });
}

function calculateNextOccurrence(currentDate: string, frequency: string, interval: number): string {
  const date = parseISO(currentDate);
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

  return format(nextDate, "yyyy-MM-dd");
}
