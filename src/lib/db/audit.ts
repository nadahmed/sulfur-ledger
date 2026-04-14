import { prisma } from "../prisma";

export interface AuditLog {
  orgId: string;
  id: string; // UUID
  userId: string;
  userName?: string;
  action: "create" | "update" | "delete" | "export" | "login" | "link" | "unlink" | "clear" | "batch";
  entityType: "JournalEntry" | "Account" | "Organization" | "Report" | "RecurringEntry" | "User" | "Invite" | "Tag" | "ChatMessage" | "AiJob" | "ApiKey" | "Invitation";
  entityId: string;
  details: string; // Description
  data?: any;      // Full item state (for Create/Delete/Export)
  changes?: Record<string, { old: any; new: any }>; // Field deltas (for Update)
  ipAddress?: string;
  userAgent?: string;
  timestamp: string;
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

export async function createAuditLog(log: AuditLog) {
  // Ensure we don't pass expiresAt to Prisma
  await prisma.auditLog.create({
    data: {
      id: log.id,
      orgId: log.orgId,
      userId: log.userId,
      userName: log.userName || "System",
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      details: log.details,
      data: log.data as any,
      changes: log.changes as any,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      timestamp: new Date(log.timestamp),
    },
  });
}

export async function createMcpActivityLog(log: McpActivityLog) {
  await prisma.mcpActivityLog.create({
    data: {
      id: log.id,
      orgId: log.orgId,
      toolName: log.toolName,
      input: log.input,
      status: log.status,
      userName: log.userName,
      error: log.error,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      timestamp: new Date(log.timestamp),
    },
  });
}

export interface ActivityFilter {
  action?: string;
  userId?: string;
  entityType?: string;
  entityId?: string;
  type?: "ui" | "mcp" | "all";
  startDate?: string;
  endDate?: string;
}

export async function getActivityLogs(
  orgId: string, 
  limit = 100, 
  cursor?: string,
  filters?: ActivityFilter
): Promise<{ logs: UnifiedActivityLog[], nextCursor: string | null }> {
  // In a relational DB, "Unified" usually means a Union query or separate fetches
  // Since we want them sorted by time, and they are separate tables, 
  // we'll fetch both or filter by type first.

  const showUi = !filters?.type || filters.type === "ui" || filters.type === "all";
  const showMcp = !filters?.type || filters.type === "mcp" || filters.type === "all";

  let uiLogs: any[] = [];
  let mcpLogs: any[] = [];

  const timeFilter: any = {};
  if (filters?.startDate) timeFilter.gte = new Date(filters.startDate);
  if (filters?.endDate) timeFilter.lte = new Date(filters.endDate);

  if (showUi) {
    uiLogs = await prisma.auditLog.findMany({
      where: {
        orgId,
        timestamp: Object.keys(timeFilter).length > 0 ? timeFilter : undefined,
        action: filters?.action && filters.action !== "all" ? (filters.action as any) : undefined,
        userId: filters?.userId && filters.userId !== "all" ? filters.userId : undefined,
        entityType: filters?.entityType && filters.entityType !== "all" ? (filters.entityType as any) : undefined,
        entityId: filters?.entityId || undefined,
      },
      orderBy: { timestamp: "desc" },
      take: limit,
    });
  }

  if (showMcp) {
    mcpLogs = await prisma.mcpActivityLog.findMany({
      where: {
        orgId,
        timestamp: Object.keys(timeFilter).length > 0 ? timeFilter : undefined,
        userName: filters?.userId && filters.userId !== "all" ? filters.userId : undefined,
        // toolName starts with filters.action if applicable
        toolName: filters?.action && filters.action !== "all" ? filters.action : undefined,
      },
      orderBy: { timestamp: "desc" },
      take: limit,
    });
  }

  // Combine and sort
  const combined = [
    ...uiLogs.map(l => ({ ...l, type: "ui" as const, timestamp: l.timestamp.toISOString() })),
    ...mcpLogs.map(l => ({ ...l, type: "mcp" as const, timestamp: l.timestamp.toISOString() }))
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
   .slice(0, limit);

  // Pagination for combined logs is complex with limit/offset across two tables.
  // For now, we'll return null for nextCursor or handle it simply.
  return { logs: combined as any, nextCursor: null };
}

export async function getAuditLogs(orgId: string, limit = 50): Promise<AuditLog[]> {
  const result = await prisma.auditLog.findMany({
    where: { orgId },
    orderBy: { timestamp: "desc" },
    take: limit,
  });
  return result.map(l => ({ ...l, timestamp: l.timestamp.toISOString() })) as any;
}

export async function getMcpActivityLogs(orgId: string, limit = 50): Promise<McpActivityLog[]> {
  const result = await prisma.mcpActivityLog.findMany({
    where: { orgId },
    orderBy: { timestamp: "desc" },
    take: limit,
  });
  return result.map(l => ({ ...l, timestamp: l.timestamp.toISOString() })) as any;
}




