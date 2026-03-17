import { TransactWriteItemsCommand, TransactWriteItem, DeleteItemCommand } from "@aws-sdk/client-dynamodb";
import { QueryCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { randomUUID } from "crypto";
import { db, TABLE_NAME } from "../dynamodb";
import { createAuditLog } from "./audit";

export interface JournalEntry {
  orgId: string;
  id: string; // UUID
  date: string; // YYYY-MM-DD
  description: string;
  notes?: string;
  createdAt: string;
}

export interface JournalLine {
  orgId: string;
  journalId: string;
  accountId: string;
  amount: number; // in cents/paisa. Positive = Debit, Negative = Credit
  date: string; // Copied from entry for easy querying in GSI
}

export async function createJournalEntry(entry: JournalEntry, lines: JournalLine[], userId: string) {
  // Validate double entry (sum of amounts = 0)
  const total = lines.reduce((acc, line) => acc + line.amount, 0);
  if (total !== 0) {
    throw new Error(`Invalid journal entry: debits and credits must sum to zero, but got ${total}`);
  }

  // Use a transaction to ensure entry and all lines are written atomically
  const transactItems: TransactWriteItem[] = [];

  // 1. Add Entry
  transactItems.push({
    Put: {
      TableName: TABLE_NAME,
      Item: marshall({
        PK: `ORG#${entry.orgId}#JOURNAL`,
        SK: `JNL#${entry.date}#${entry.id}`,
        Type: "JournalEntry",
        ...entry,
      }, { removeUndefinedValues: true }),
    },
  });

  // 2. Add Lines
  for (const line of lines) {
    transactItems.push({
      Put: {
        TableName: TABLE_NAME,
        Item: marshall({
          // To get all lines for a journal entry
          PK: `ORG#${entry.orgId}#JOURNAL`,
          SK: `LINE#${entry.id}#${line.accountId}`,
          Type: "JournalLine",
          // GSI1 to get all lines for an account, sorted by date
          GSI1PK: `ORG#${line.orgId}#ACC#${line.accountId}`,
          GSI1SK: `JNL#${line.date}#${line.journalId}`,
          ...line,
        }, { removeUndefinedValues: true }),
      },
    });
  }

  // DynamoDB max items in transaction is 100
  if (transactItems.length > 100) {
    throw new Error("Too many items for a single transaction (limit 100)");
  }

  // Using raw client for transactions as lib-dynamodb sometimes has typing quirks with TransactWrite
  const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
  const client = new DynamoDBClient({
    region: process.env.AWS_REGION || "us-east-1",
    ...(process.env.DYNAMODB_LOCAL_ENDPOINT ? { 
      endpoint: process.env.DYNAMODB_LOCAL_ENDPOINT,
      credentials: { accessKeyId: "fake", secretAccessKey: "fake" }
    } : {})
  });
  
  await client.send(new TransactWriteItemsCommand({ TransactItems: transactItems }));
  
  // Audit Log
  await createAuditLog({
    orgId: entry.orgId,
    id: randomUUID(),
    userId,
    action: "create",
    entityType: "JournalEntry",
    entityId: entry.id,
    details: JSON.stringify({ date: entry.date, description: entry.description }),
    timestamp: new Date().toISOString(),
  });

  return { entry, lines };
}

export async function getJournalEntries(orgId: string, startDate?: string, endDate?: string): Promise<JournalEntry[]> {
  // If no dates provided, get all (in a heavily used system, you'd always mandate pagination/dates)
  // For Simple Ledger, we query SK begins_with JNL#
  let skCondition = "";
  const expressionAttributeValues: any = {
    ":pk": `ORG#${orgId}#JOURNAL`,
  };

  if (startDate && endDate) {
    skCondition = "SK BETWEEN :start AND :end";
    expressionAttributeValues[":start"] = `JNL#${startDate}#`;
    expressionAttributeValues[":end"] = `JNL#${endDate}#zh\uffff`;
  } else {
    skCondition = "begins_with(SK, :skPrefix)";
    expressionAttributeValues[":skPrefix"] = "JNL#";
  }

  const result = await db.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: `PK = :pk AND ${skCondition}`,
      ExpressionAttributeValues: expressionAttributeValues,
    })
  );

  return (result.Items as unknown as JournalEntry[]) || [];
}

export async function getJournalEntriesWithLines(
  orgId: string, 
  limit = 20, 
  cursor?: string,
  date?: string
) {
  const pk = `ORG#${orgId}#JOURNAL`;
  const skPrefix = date ? `JNL#${date}` : "JNL#";

  const params: any = {
    TableName: TABLE_NAME,
    KeyConditionExpression: `PK = :pk AND begins_with(SK, :skPrefix)`,
    ExpressionAttributeValues: {
      ":pk": pk,
      ":skPrefix": skPrefix,
    },
    ScanIndexForward: false, // latest on top
    Limit: limit,
  };

  if (cursor) {
    params.ExclusiveStartKey = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
  }

  const result = await db.send(new QueryCommand(params));
  const entries = (result.Items as unknown as JournalEntry[]) || [];

  // Fetch lines in parallel for the retrieved entries
  const entriesWithLines = await Promise.all(
    entries.map(async (entry) => {
      const linesResult = await db.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: `PK = :pk AND begins_with(SK, :skPrefix)`,
          ExpressionAttributeValues: {
            ":pk": pk,
            ":skPrefix": `LINE#${entry.id}#`,
          },
        })
      );
      return {
        ...entry,
        lines: (linesResult.Items as unknown as JournalLine[]) || [],
      };
    })
  );

  const nextCursor = result.LastEvaluatedKey
    ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
    : null;

  return { data: entriesWithLines, nextCursor };
}

export async function getAccountLines(orgId: string, accountId: string, startDate?: string, endDate?: string): Promise<JournalLine[]> {
  let skCondition = "";
  const expressionAttributeValues: any = {
    ":pk": `ORG#${orgId}#ACC#${accountId}`,
  };

  if (startDate && endDate) {
    skCondition = "GSI1SK BETWEEN :start AND :end";
    expressionAttributeValues[":start"] = `JNL#${startDate}#`;
    expressionAttributeValues[":end"] = `JNL#${endDate}#zh\uffff`;
  } else {
    skCondition = "begins_with(GSI1SK, :skPrefix)";
    expressionAttributeValues[":skPrefix"] = "JNL#";
  }

  const result = await db.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: "GSI1",
      KeyConditionExpression: `GSI1PK = :pk AND ${skCondition}`,
      ExpressionAttributeValues: expressionAttributeValues,
    })
  );

  return (result.Items as unknown as JournalLine[]) || [];
}

export async function deleteJournalEntry(orgId: string, entryId: string, date: string, userId: string) {
  // 1. Get lines to delete (PK=ORG#ID#JOURNAL, SK=LINE#ID#)
  const pk = `ORG#${orgId}#JOURNAL`;
  const linesResult = await db.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
      ExpressionAttributeValues: {
        ":pk": pk,
        ":skPrefix": `LINE#${entryId}#`,
      },
    })
  );
  
  const lines = linesResult.Items || [];

  const transactItems: TransactWriteItem[] = [];

  // Delete Entry
  transactItems.push({
    Delete: {
      TableName: TABLE_NAME,
      Key: marshall({
        PK: pk,
        SK: `JNL#${date}#${entryId}`,
      }),
    },
  });

  // Delete Lines
  for (const line of lines) {
    transactItems.push({
      Delete: {
        TableName: TABLE_NAME,
        Key: marshall({
          PK: pk,
          SK: `LINE#${entryId}#${line.accountId}`,
        }),
      },
    });
  }

  const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
  const client = new DynamoDBClient({
    region: process.env.AWS_REGION || "us-east-1",
    ...(process.env.DYNAMODB_LOCAL_ENDPOINT ? { 
      endpoint: process.env.DYNAMODB_LOCAL_ENDPOINT,
      credentials: { accessKeyId: "fake", secretAccessKey: "fake" }
    } : {})
  });
  
  await client.send(new TransactWriteItemsCommand({ TransactItems: transactItems }));

  // Audit Log
  await createAuditLog({
    orgId,
    id: crypto.randomUUID(),
    userId,
    action: "delete",
    entityType: "JournalEntry",
    entityId: entryId,
    details: JSON.stringify({ date }),
    timestamp: new Date().toISOString(),
  });
}

export async function updateJournalEntry(
  orgId: string, 
  entryId: string, 
  oldDate: string,
  newEntry: Partial<JournalEntry>, 
  newLines: JournalLine[],
  userId: string
) {
  // Simplest way is to delete old and create new in a single transaction if date changed,
  // or just update if date is same. To keep it robust, let's treat it as a replacement of lines.
  
  // 1. Get existing lines
  const pk = `ORG#${orgId}#JOURNAL`;
  const oldLinesResult = await db.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
      ExpressionAttributeValues: {
        ":pk": pk,
        ":skPrefix": `LINE#${entryId}#`,
      },
    })
  );
  const oldLines = oldLinesResult.Items || [];

  const transactItems: TransactWriteItem[] = [];

  // If date changed, we must delete old entry record and create a new one because date is in SK
  if (newEntry.date && newEntry.date !== oldDate) {
    transactItems.push({
      Delete: {
        TableName: TABLE_NAME,
        Key: marshall({ PK: pk, SK: `JNL#${oldDate}#${entryId}` }),
      },
    });
  }

  // Put (Update) Entry
  transactItems.push({
    Put: {
      TableName: TABLE_NAME,
      Item: marshall({
        PK: pk,
        SK: `JNL#${newEntry.date || oldDate}#${entryId}`,
        Type: "JournalEntry",
        orgId,
        id: entryId,
        ...newEntry,
      }, { removeUndefinedValues: true }),
    },
  });

  // Delete old lines
  for (const line of oldLines) {
    transactItems.push({
      Delete: {
        TableName: TABLE_NAME,
        Key: marshall({ PK: pk, SK: `LINE#${entryId}#${line.accountId}` }),
      },
    });
  }

  // Add new lines
  for (const line of newLines) {
    transactItems.push({
      Put: {
        TableName: TABLE_NAME,
        Item: marshall({
          PK: pk,
          SK: `LINE#${entryId}#${line.accountId}`,
          Type: "JournalLine",
          GSI1PK: `ORG#${line.orgId}#ACC#${line.accountId}`,
          GSI1SK: `JNL#${line.date}#${line.journalId}`,
          ...line,
        }, { removeUndefinedValues: true }),
      },
    });
  }

  const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
  const client = new DynamoDBClient({
    region: process.env.AWS_REGION || "us-east-1",
    ...(process.env.DYNAMODB_LOCAL_ENDPOINT ? { 
      endpoint: process.env.DYNAMODB_LOCAL_ENDPOINT,
      credentials: { accessKeyId: "fake", secretAccessKey: "fake" }
    } : {})
  });
  
  await client.send(new TransactWriteItemsCommand({ TransactItems: transactItems }));

  // Audit Log
  await createAuditLog({
    orgId,
    id: crypto.randomUUID(),
    userId,
    action: "update",
    entityType: "JournalEntry",
    entityId: entryId,
    details: JSON.stringify({ 
      oldDate, 
      newDate: newEntry.date,
      description: newEntry.description 
    }),
    timestamp: new Date().toISOString(),
  });
}
