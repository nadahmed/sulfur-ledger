import { useQuery } from "@tanstack/react-query";
import { ledgerClient } from "@/lib/ledger-client";
import { format } from "date-fns";

export function useDashboardSummary(orgId: string | null | undefined, dateFrom?: Date, dateTo?: Date) {
  return useQuery({
    queryKey: ["dashboard-summary", orgId, dateFrom, dateTo],
    queryFn: () => {
      const start = dateFrom ? format(dateFrom, "yyyy-MM-dd") : undefined;
      const end = dateTo ? format(dateTo, "yyyy-MM-dd") : undefined;
      return ledgerClient.reports.getDashboardSummary(orgId!, start, end);
    },
    enabled: !!orgId,
  });
}

export function useTrendData(
  orgId: string | null | undefined, 
  period: "days" | "weeks" | "months" | "years", 
  dateFrom?: Date, 
  dateTo?: Date
) {
  return useQuery({
    queryKey: ["dashboard-trend", orgId, period, dateFrom, dateTo],
    queryFn: () => {
      const start = dateFrom ? format(dateFrom, "yyyy-MM-dd") : undefined;
      const end = dateTo ? format(dateTo, "yyyy-MM-dd") : undefined;
      return ledgerClient.reports.getTrendData(orgId!, period, start, end);
    },
    enabled: !!orgId,
  });
}

export function useRecentActivity(orgId: string | null | undefined, limit = 10) {
  return useQuery({
    queryKey: ["dashboard-activity", orgId, limit],
    queryFn: async () => {
      const data = await ledgerClient.activity.getRecent(orgId!, limit);
      return data.logs.slice(0, 3); // Maintain the "last 3" behavior for dashboard
    },
    enabled: !!orgId,
  });
}

export function useReport(
  orgId: string | null | undefined, 
  type: string, 
  startDate?: string, 
  endDate?: string, 
  tagIds?: string[]
) {
  return useQuery({
    queryKey: ["reports", orgId, type, startDate, endDate, tagIds],
    queryFn: () => ledgerClient.reports.getReport(orgId!, type, startDate, endDate, tagIds),
    enabled: !!orgId,
  });
}
