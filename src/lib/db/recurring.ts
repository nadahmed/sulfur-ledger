import { PutCommand, QueryCommand, GetCommand, DeleteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { db, TABLE_NAME } from "../dynamodb";
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

export async function createRecurringEntry(entry: RecurringEntry, userId?: string, userName?: string) {
  await db.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `ORG#${entry.orgId}#RECURRING`,
        SK: `REC#${entry.id}`,
        Type: "RecurringEntry",
        ...entry,
      },
    })
  );

  if (userId) {
    await createAuditLog({
      orgId: entry.orgId,
      id: uuidv7(),
      userId,
      userName,
      action: "create",
      entityType: "RecurringEntry",
      entityId: entry.id,
      details: JSON.stringify({ description: entry.description, frequency: entry.frequency }),
      timestamp: new Date().toISOString(),
    });
  }

  return entry;
}

export async function getRecurringEntries(orgId: string): Promise<RecurringEntry[]> {
  const result = await db.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
      ExpressionAttributeValues: {
        ":pk": `ORG#${orgId}#RECURRING`,
        ":skPrefix": "REC#",
      },
    })
  );
  return (result.Items as RecurringEntry[]) || [];
}

export async function getRecurringEntry(orgId: string, id: string): Promise<RecurringEntry | null> {
  const result = await db.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `ORG#${orgId}#RECURRING`,
        SK: `REC#${id}`,
      },
    })
  );
  return (result.Item as RecurringEntry) || null;
}

export async function updateRecurringEntry(orgId: string, id: string, updates: Partial<RecurringEntry>, userId?: string, userName?: string) {
  const { UpdateCommand } = require("@aws-sdk/lib-dynamodb");
  
  let updateExpression = "SET";
  const expressionAttributeNames: Record<string, string> = {};
  const expressionAttributeValues: Record<string, any> = {};

  Object.entries(updates).forEach(([key, value], index) => {
    if (key === "orgId" || key === "id") return;
    const attrName = `#field${index}`;
    const attrVal = `:val${index}`;
    updateExpression += ` ${attrName} = ${attrVal},`;
    expressionAttributeNames[attrName] = key;
    expressionAttributeValues[attrVal] = value;
  });

  // Remove trailing comma
  updateExpression = updateExpression.slice(0, -1);

  await db.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `ORG#${orgId}#RECURRING`,
        SK: `REC#${id}`,
      },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
    })
  );

  if (userId) {
    await createAuditLog({
      orgId,
      id: uuidv7(),
      userId,
      userName,
      action: "update",
      entityType: "RecurringEntry",
      entityId: id,
      details: "Updated recurring entry",
      timestamp: new Date().toISOString(),
    });
  }
}

export async function deleteRecurringEntry(orgId: string, id: string, userId?: string, userName?: string) {
  await db.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `ORG#${orgId}#RECURRING`,
        SK: `REC#${id}`,
      },
    })
  );

  if (userId) {
    await createAuditLog({
      orgId,
      id: uuidv7(),
      userId,
      userName,
      action: "delete",
      entityType: "RecurringEntry",
      entityId: id,
      details: "Deleted recurring entry",
      timestamp: new Date().toISOString(),
    });
  }
}

export async function getRecurringEntriesByAccount(orgId: string, accountId: string): Promise<RecurringEntry[]> {
  const result = await db.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
      FilterExpression: "fromAccountId = :accountId OR toAccountId = :accountId",
      ExpressionAttributeValues: {
        ":pk": `ORG#${orgId}#RECURRING`,
        ":skPrefix": "REC#",
        ":accountId": accountId,
      },
    })
  );
  return (result.Items as RecurringEntry[]) || [];
}
