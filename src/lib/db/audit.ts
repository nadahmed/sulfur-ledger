import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { db, TABLE_NAME } from "../dynamodb";

export interface AuditLog {
  orgId: string;
  id: string; // UUID
  userId: string;
  userName?: string;
  action: "create" | "update" | "delete";
  entityType: "JournalEntry" | "Account" | "Organization";
  entityId: string;
  details: string; // JSON string or description
  timestamp: string;
}

export async function createAuditLog(log: AuditLog) {
  await db.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `ORG#${log.orgId}#AUDIT`,
        SK: `AUDIT#${log.timestamp}#${log.id}`,
        Type: "AuditLog",
        ...log,
      },
    })
  );
  return log;
}

export async function getAuditLogs(orgId: string, limit = 50): Promise<AuditLog[]> {
  const result = await db.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
      ExpressionAttributeValues: {
        ":pk": `ORG#${orgId}#AUDIT`,
        ":skPrefix": "AUDIT#",
      },
      ScanIndexForward: false, // Latest first
      Limit: limit,
    })
  );
  return (result.Items as AuditLog[]) || [];
}
