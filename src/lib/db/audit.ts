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
  expiresAt: number; // DynamoDB TTL (seconds since epoch)
}

export interface McpActivityLog {
  orgId: string;
  id: string; // UUID
  toolName: string;
  input: string; // JSON string
  status: "success" | "error";
  error?: string;
  timestamp: string;
  expiresAt: number; // DynamoDB TTL (seconds since epoch)
}

/**
 * Unified Activity Log interface for the UI
 */
export interface UnifiedActivityLog extends Partial<AuditLog>, Partial<McpActivityLog> {
  type: "ui" | "mcp";
  timestamp: string;
  id: string;
  orgId: string;
}

const RETENTION_DAYS = 90;

export async function createAuditLog(log: Omit<AuditLog, "expiresAt">) {
  const expiresAt = Math.floor(Date.now() / 1000) + (RETENTION_DAYS * 24 * 60 * 60);
  
  const writePromise = db.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `ORG#${log.orgId}#ACTIVITY`,
        SK: `TIME#${log.timestamp}#UI#${log.id}`,
        Type: "AuditLog",
        ...log,
        expiresAt,
      },
    })
  );

  // Fire and forget (but await for lambda safety if needed, here we'll just return it)
  return await writePromise;
}

export async function createMcpActivityLog(log: Omit<McpActivityLog, "expiresAt">) {
  const expiresAt = Math.floor(Date.now() / 1000) + (RETENTION_DAYS * 24 * 60 * 60);

  const writePromise = db.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `ORG#${log.orgId}#ACTIVITY`,
        SK: `TIME#${log.timestamp}#MCP#${log.id}`,
        Type: "McpActivityLog",
        ...log,
        expiresAt,
      },
    })
  );

  return await writePromise;
}

export async function getActivityLogs(orgId: string, limit = 500): Promise<UnifiedActivityLog[]> {
  const result = await db.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
      ExpressionAttributeValues: {
        ":pk": `ORG#${orgId}#ACTIVITY`,
        ":skPrefix": "TIME#",
      },
      ScanIndexForward: false, // Latest first
      Limit: limit,
    })
  );

  return (result.Items as any[]).map(item => ({
    ...item,
    type: item.Type === "McpActivityLog" ? "mcp" : "ui"
  })) as UnifiedActivityLog[];
}

// Legacy functions for backward compatibility (can be removed later)
export async function getAuditLogs(orgId: string, limit = 50): Promise<AuditLog[]> {
  const logs = await getActivityLogs(orgId, limit);
  return logs.filter(l => l.type === "ui") as AuditLog[];
}

export async function getMcpActivityLogs(orgId: string, limit = 50): Promise<McpActivityLog[]> {
  const logs = await getActivityLogs(orgId, limit);
  return logs.filter(l => l.type === "mcp") as McpActivityLog[];
}



