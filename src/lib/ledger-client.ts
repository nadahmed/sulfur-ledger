/**
 * @module ledgerClient
 * 
 * Client-side service layer for interacting with the Ledger API.
 * Mirrors the server-side LedgerService structure for consistency.
 */

export interface DashboardSummary {
  totalAssets: number;
  netIncome: number;
  totalIncome: number;
  totalExpenses: number;
  cashBalance: number;
  assetDistribution: { name: string; value: number; fill: string }[];
  expenseDistribution: { name: string; value: number; fill: string }[];
  incomeStats: { name: string; amount: number; fill: string }[];
}

export interface TrendItem {
  label: string;
  income: number;
  expense: number;
}

export interface ActivityLog {
  id: string;
  type: "mcp" | "ui";
  toolName?: string;
  action?: string;
  entityType?: string;
  details?: string;
  input?: string;
  timestamp: string;
  userName?: string;
  status?: string;
}

export interface PaginatedResponse<T> {
  logs: T[];
  nextCursor: string | null;
}

export const ledgerClient = {
  reports: {
    async getDashboardSummary(orgId: string, start?: string, end?: string): Promise<DashboardSummary> {
      const params = new URLSearchParams({ type: "dashboard" });
      if (start) params.append("start", start);
      if (end) params.append("end", end);
      
      const res = await fetch(`/api/reports?${params.toString()}`, {
        headers: { "x-org-id": orgId }
      });
      if (!res.ok) throw new Error("Failed to fetch dashboard summary");
      return res.json();
    },

    async getTrendData(orgId: string, period: string, start?: string, end?: string): Promise<TrendItem[]> {
      const params = new URLSearchParams({ type: "trend", period });
      if (start) params.append("start", start);
      if (end) params.append("end", end);
      
      const res = await fetch(`/api/reports?${params.toString()}`, {
        headers: { "x-org-id": orgId }
      });
      if (!res.ok) throw new Error("Failed to fetch trend data");
      return res.json();
    },

    async getReport(orgId: string, type: string, start?: string, end?: string, tags?: string[]): Promise<any> {
      const params = new URLSearchParams({ type });
      if (start) params.append("start", start);
      if (end) params.append("end", end);
      if (tags?.length) params.append("tags", tags.join(","));
      
      const res = await fetch(`/api/reports?${params.toString()}`, {
        headers: { "x-org-id": orgId }
      });
      if (!res.ok) throw new Error(`Failed to fetch ${type} report`);
      return res.json();
    }
  },

  activity: {
    async getRecent(orgId: string, limit = 10, cursor?: string): Promise<PaginatedResponse<ActivityLog>> {
      const params = new URLSearchParams({ orgId, limit: limit.toString() });
      if (cursor) params.append("cursor", cursor);
      
      const res = await fetch(`/api/activity?${params.toString()}`, {
        headers: { "x-org-id": orgId }
      });
      if (!res.ok) throw new Error("Failed to fetch activity logs");
      return res.json();
    }
  }
};
