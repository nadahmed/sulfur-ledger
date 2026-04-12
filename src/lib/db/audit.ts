import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { db, TABLE_NAME } from "../dynamodb";

export interface AuditLog {
  orgId: string;
  id: string; // UUID
  userId: string;
  userName?: string;
  action: "create" | "update" | "delete" | "export" | "login" | "link" | "unlink";
  entityType: "JournalEntry" | "Account" | "Organization" | "Report" | "RecurringEntry" | "User" | "Invite";
  entityId: string;
  details: string; // Description
  data?: any;      // Full item state (for Create/Delete/Export)
  changes?: Record<string, { old: any; new: any }>; // Field deltas (for Update)
  ipAddress?: string;
  userAgent?: string;
  timestamp: string;
  expiresAt: number; // DynamoDB TTL (seconds since epoch)
}

export interface McpActivityLog {
  orgId: string;
  id: string; // UUID
  toolName: string;
  input: string; // JSON string
  status: "success" | "error";
  userName?: string;
  error?: string;
  timestamp: string;
  expiresAt: number; // DynamoDB TTL (seconds since epoch)
  ipAddress?: string;
  userAgent?: string;
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

export interface ActivityFilter {
  action?: string;
  userId?: string;
  entityType?: string;
  entityId?: string;
  type?: "ui" | "mcp";
  startDate?: string;
  endDate?: string;
}

export async function getActivityLogs(
  orgId: string, 
  limit = 100, 
  cursor?: string,
  filters?: ActivityFilter
): Promise<{ logs: UnifiedActivityLog[], nextCursor: string | null }> {
  const expressionAttributeNames: Record<string, string> = {};
  const expressionAttributeValues: Record<string, any> = {
    ":pk": `ORG#${orgId}#ACTIVITY`,
  };
  
  let skCondition = "begins_with(SK, :skPrefix)";
  expressionAttributeValues[":skPrefix"] = "TIME#";

  if (filters?.startDate || filters?.endDate) {
    const start = filters?.startDate ? `TIME#${filters.startDate}` : "TIME#";
    const end = filters?.endDate ? `TIME#${filters.endDate}T23:59:59Z` : "TIME#\uffff";
    skCondition = "SK BETWEEN :start AND :end";
    expressionAttributeValues[":start"] = start;
    expressionAttributeValues[":end"] = end;
  }

  const filterExpressions: string[] = [];

  if (filters?.action && filters.action !== "all") {
    filterExpressions.push("(#action = :action OR toolName = :action)");
    expressionAttributeNames["#action"] = "action";
    expressionAttributeValues[":action"] = filters.action;
  }

  if (filters?.userId && filters.userId !== "all") {
    filterExpressions.push("userId = :userId");
    expressionAttributeValues[":userId"] = filters.userId;
  }

  if (filters?.entityType && filters.entityType !== "all") {
    filterExpressions.push("entityType = :entityType");
    expressionAttributeValues[":entityType"] = filters.entityType;
  }

  if (filters?.entityId) {
    filterExpressions.push("entityId = :entityId");
    expressionAttributeValues[":entityId"] = filters.entityId;
  }

  if (filters?.type && filters.type !== "all") {
    filterExpressions.push("#type = :type");
    expressionAttributeNames["#type"] = "Type";
    expressionAttributeValues[":type"] = filters.type === "ui" ? "AuditLog" : "McpActivityLog";
  }

  const queryParams: any = {
    TableName: TABLE_NAME,
    KeyConditionExpression: `PK = :pk AND ${skCondition}`,
    FilterExpression: filterExpressions.length > 0 ? filterExpressions.join(" AND ") : undefined,
    ExpressionAttributeValues: expressionAttributeValues,
    ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
    ScanIndexForward: false, // Latest first
    Limit: limit,
  };

  if (cursor) {
    try {
      queryParams.ExclusiveStartKey = JSON.parse(Buffer.from(cursor, "base64").toString("utf-8"));
    } catch (e) {
      console.error("Invalid cursor:", e);
    }
  }

  const result = await db.send(new QueryCommand(queryParams));

  const logs = (result.Items as any[] || []).map(item => ({
    ...item,
    type: item.Type === "McpActivityLog" ? "mcp" : "ui"
  })) as UnifiedActivityLog[];

  const nextCursor = result.LastEvaluatedKey 
    ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString("base64")
    : null;

  return { logs, nextCursor };
}

// Legacy functions for backward compatibility
export async function getAuditLogs(orgId: string, limit = 50): Promise<AuditLog[]> {
  const { logs } = await getActivityLogs(orgId, limit, undefined, { type: "ui" });
  return logs as AuditLog[];
}

export async function getMcpActivityLogs(orgId: string, limit = 50): Promise<McpActivityLog[]> {
  const { logs } = await getActivityLogs(orgId, limit, undefined, { type: "mcp" });
  return logs as McpActivityLog[];
}




