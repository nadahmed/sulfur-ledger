"use client";

import { useMemo, useEffect, Suspense } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import Link from "next/link";
import {
  Download, RotateCcw, FileBarChart2, Landmark, TrendingUp,
  CheckCircle2, AlertTriangle, ArrowUpRight, ArrowDownRight, Tag
} from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";
import { parseISO, format as formatISO, startOfMonth, endOfMonth, startOfYear, subMonths } from "date-fns";
import { useOrganization } from "@/context/OrganizationContext";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { TagSelector } from "@/components/journals/TagSelector";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { cn, formatCurrency } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AccountBalance {
  id: string;
  name: string;
  category: string;
  balance: number;
}

interface ReportData {
  accounts?: AccountBalance[];
  totalDebits?: number;
  totalCredits?: number;
  assets?: AccountBalance[];
  liabilities?: AccountBalance[];
  equity?: AccountBalance[];
  income?: AccountBalance[];
  expenses?: AccountBalance[];
}

// ─── Report type definitions ─────────────────────────────────────────────────

const REPORT_TYPES = [
  { id: "trial-balance",    label: "Trial Balance",     icon: FileBarChart2 },
  { id: "balance-sheet",    label: "Balance Sheet",     icon: Landmark },
  { id: "income-statement", label: "Income Statement",  icon: TrendingUp },
];

// ─── Quick date presets ───────────────────────────────────────────────────────

const DATE_PRESETS = [
  {
    label: "This Month",
    fn: () => ({
      start: formatISO(startOfMonth(new Date()), "yyyy-MM-dd"),
      end:   formatISO(endOfMonth(new Date()),   "yyyy-MM-dd"),
    }),
  },
  {
    label: "Last Month",
    fn: () => {
      const last = subMonths(new Date(), 1);
      return { start: formatISO(startOfMonth(last), "yyyy-MM-dd"), end: formatISO(endOfMonth(last), "yyyy-MM-dd") };
    },
  },
  {
    label: "This Year",
    fn: () => ({
      start: formatISO(startOfYear(new Date()), "yyyy-MM-dd"),
      end:   formatISO(new Date(), "yyyy-MM-dd"),
    }),
  },
];

// ─── Root export (Suspense boundary required for useSearchParams) ─────────────

export default function ReportsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted-foreground">Loading reports…</div>}>
      <ReportsInner />
    </Suspense>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

function ReportsInner() {
  const { activeOrganizationId, organizations, permissions, isOwner, isLoading: orgLoading } = useOrganization();
  const activeOrg = organizations.find((o) => o.id === activeOrganizationId);
  const router     = useRouter();
  const searchParams = useSearchParams();
  const pathname   = usePathname();

  const urlType = searchParams.get("type");

  const [reportType, setReportType] = useLocalStorage(
    activeOrganizationId ? `reports-type-${activeOrganizationId}` : "reports-type",
    "trial-balance"
  );
  const [startDate, setStartDate] = useLocalStorage(
    activeOrganizationId ? `reports-start-${activeOrganizationId}` : "reports-start",
    ""
  );
  const [endDate, setEndDate] = useLocalStorage(
    activeOrganizationId ? `reports-end-${activeOrganizationId}` : "reports-end",
    ""
  );
  const [selectedTagIds, setSelectedTagIds] = useLocalStorage<string[]>(
    activeOrganizationId ? `reports-tags-${activeOrganizationId}` : "reports-tags",
    []
  );

  const canRead = isOwner || permissions.includes("read:reports");

  // Sync URL type → local storage type
  useEffect(() => {
    if (urlType && REPORT_TYPES.find((t) => t.id === urlType)) {
      if (reportType !== urlType) setReportType(urlType);
    } else if (reportType && !urlType) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("type", reportType);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }
  }, [urlType, reportType, searchParams, pathname, router, setReportType]);

  const handleTabChange = (id: string) => {
    setReportType(id);
    const params = new URLSearchParams(searchParams.toString());
    params.set("type", id);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const handlePreset = (preset: (typeof DATE_PRESETS)[number]) => {
    const { start, end } = preset.fn();
    setStartDate(start);
    setEndDate(end);
  };

  const handleReset = () => { setStartDate(""); setEndDate(""); setSelectedTagIds([]); };

  const handlePdfDownload = () => {
    let url = `/api/reports/pdf?type=${reportType}`;
    if (startDate) url += `&start=${startDate}`;
    if (endDate)   url += `&end=${endDate}`;
    if (selectedTagIds.length > 0) url += `&tags=${selectedTagIds.join(",")}`;
    window.open(url, "_blank");
  };

  const { data, isLoading: isFetching, isError, error } = useQuery<ReportData>({
    queryKey: ["reports", activeOrganizationId, reportType, startDate, endDate, selectedTagIds],
    queryFn: async () => {
      let url = `/api/reports?type=${reportType}`;
      if (startDate) url += `&start=${startDate}`;
      if (endDate)   url += `&end=${endDate}`;
      if (selectedTagIds.length > 0) url += `&tags=${selectedTagIds.join(",")}`;
      const res = await fetch(url, { headers: { "x-org-id": activeOrganizationId! } });
      if (!res.ok) throw new Error("Failed to fetch report");
      return res.json();
    },
    enabled: !!activeOrganizationId && canRead,
  });

  // Currency formatter
  const fmt = (amount: number) =>
    formatCurrency(
      amount / 100,
      activeOrg?.currencySymbol,
      activeOrg?.currencyPosition,
      activeOrg?.currencyHasSpace,
      activeOrg?.thousandSeparator,
      activeOrg?.decimalSeparator,
      activeOrg?.grouping as any,
      activeOrg?.decimalPlaces
    );

  // Chart data
  const chartData = useMemo(() => {
    if (!data) return [];
    if (reportType === "income-statement") {
      const totalIncome   = (data.income   || []).reduce((s, i) => s + Math.abs(i.balance), 0) / 100;
      const totalExpenses = (data.expenses || []).reduce((s, i) => s + Math.abs(i.balance), 0) / 100;
      return [
        { name: "Income",   amount: totalIncome,   fill: "hsl(142,70%,45%)" },
        { name: "Expenses", amount: totalExpenses, fill: "hsl(0,70%,55%)" },
      ];
    }
    if (reportType === "balance-sheet") {
      const totalAssets = (data.assets      || []).reduce((s, i) => s + i.balance, 0) / 100;
      const totalLia    = (data.liabilities || []).reduce((s, i) => s + i.balance, 0) / 100;
      const totalEq     = (data.equity      || []).reduce((s, i) => s + i.balance, 0) / 100;
      return [
        { name: "Assets",      amount: totalAssets,        fill: "hsl(217,91%,60%)" },
        { name: "Liabilities", amount: Math.abs(totalLia), fill: "hsl(0,70%,55%)"   },
        { name: "Equity",      amount: Math.abs(totalEq),  fill: "hsl(271,81%,56%)" },
      ];
    }
    return [];
  }, [data, reportType]);

  // Summary metrics per report type
  const metrics = useMemo(() => {
    if (!data) return [];
    if (reportType === "income-statement") {
      const totalIncome   = (data.income   || []).reduce((s, a) => s + a.balance, 0);
      const totalExpenses = (data.expenses || []).reduce((s, a) => s + a.balance, 0);
      const netIncome     = (totalIncome + totalExpenses) * -1;
      return [
        { label: "Total Income",   value: fmt(Math.abs(totalIncome)),   icon: ArrowUpRight,   color: "text-emerald-500", bg: "bg-emerald-500/10" },
        { label: "Total Expenses", value: fmt(Math.abs(totalExpenses)), icon: ArrowDownRight, color: "text-rose-500",    bg: "bg-rose-500/10"    },
        { label: "Net Income",     value: fmt(netIncome), icon: TrendingUp,
          color: netIncome >= 0 ? "text-emerald-500" : "text-rose-500",
          bg:    netIncome >= 0 ? "bg-emerald-500/10" : "bg-rose-500/10" },
      ];
    }
    return [];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, reportType]);

  if (orgLoading) return <div className="p-8 text-center text-muted-foreground">Loading…</div>;

  if (!activeOrganizationId) {
    return (
      <div className="p-8 text-center">
        No organization selected. Please go to <Link href="/app/onboarding" className="underline text-primary">Onboarding</Link>.
      </div>
    );
  }

  const activeType = REPORT_TYPES.find((t) => t.id === reportType)!;
  const hasActiveFilters = startDate || endDate || selectedTagIds.length > 0;

  return (
    <div className="w-full max-w-screen-2xl p-4 md:p-6 space-y-5 min-h-screen">

      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Financial Reports</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {activeOrg?.name} · {activeType?.label}
          </p>
        </div>

        <Button variant="outline" size="sm" className="h-9 w-full sm:w-auto text-xs shrink-0" onClick={handlePdfDownload}>
          <Download className="h-3.5 w-3.5 mr-1.5" /> Export PDF
        </Button>
      </div>

      {/* ── Report Type Tabs ─────────────────────────────────────────────── */}
      <div className="flex bg-muted/40 border border-border rounded-lg p-1 w-full sm:w-fit gap-1">
        {REPORT_TYPES.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => handleTabChange(id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all flex-1 sm:flex-initial justify-center",
              reportType === id
                ? "bg-card text-foreground shadow-sm border border-border"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden sm:inline">{label}</span>
            <span className="inline sm:hidden">{label.split(" ")[0]}</span>
          </button>
        ))}
      </div>

      {/* ── Filter Bar ───────────────────────────────────────────────────── */}
      <Card className="border-border shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-col gap-3">

            {/* Row 1: Date + Tags + Reset */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">

              {/* From date */}
              <div className="space-y-1">
                <Label className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wide">From</Label>
                <DatePicker
                  date={startDate ? parseISO(startDate) : undefined}
                  setDate={(d) => setStartDate(d ? formatISO(d, "yyyy-MM-dd") : "")}
                  className="h-9 w-full"
                  placeholder="Start date"
                />
              </div>

              {/* To date */}
              <div className="space-y-1">
                <Label className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wide">To</Label>
                <DatePicker
                  date={endDate ? parseISO(endDate) : undefined}
                  setDate={(d) => setEndDate(d ? formatISO(d, "yyyy-MM-dd") : "")}
                  className="h-9 w-full"
                  placeholder="End date"
                />
              </div>

              {/* Tags */}
              <div className="space-y-1">
                <Label className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wide flex items-center gap-1">
                  <Tag className="h-3 w-3" /> Tags
                </Label>
                <TagSelector
                  value={selectedTagIds}
                  onChange={setSelectedTagIds}
                  activeOrganizationId={activeOrganizationId}
                />
              </div>

              {/* Reset */}
              <div className="flex items-end">
                <Button
                  variant={hasActiveFilters ? "default" : "outline"}
                  size="sm"
                  className="h-9 w-full text-xs"
                  onClick={handleReset}
                  disabled={!hasActiveFilters}
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                  {hasActiveFilters ? "Clear Filters" : "No Filters"}
                </Button>
              </div>
            </div>

            {/* Row 2: Quick presets */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wide">Quick:</span>
              {DATE_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => handlePreset(preset)}
                  className="text-xs px-2.5 py-1 rounded-md border border-border bg-muted/30 hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {preset.label}
                </button>
              ))}
              {(startDate || endDate) && (
                <span className="text-xs text-muted-foreground">
                  {startDate || "—"} → {endDate || "—"}
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Permission guard ─────────────────────────────────────────────── */}
      {!canRead ? (
        <Card>
          <CardContent className="py-20 text-center text-destructive">You do not have permission to view financial reports.</CardContent>
        </Card>
      ) : (
        <>
          {/* ── Summary Metrics ──────────────────────────────────────────── */}
          {(isFetching || metrics.length > 0) && (
            <div className={cn("grid gap-4", metrics.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
              {isFetching
                ? Array.from({ length: reportType === "income-statement" ? 3 : 2 }).map((_, i) => (
                    <Card key={i} className="border-border animate-pulse">
                      <CardContent className="p-4">
                        <div className="h-4 w-24 bg-muted rounded mb-3" />
                        <div className="h-7 w-32 bg-muted rounded" />
                      </CardContent>
                    </Card>
                  ))
                : metrics.map(({ label, value, icon: Icon, color, bg }) => (
                    <Card key={label} className="border-border shadow-sm">
                      <CardContent className="p-4 flex items-center gap-4">
                        <div className={cn("p-2.5 rounded-lg shrink-0", bg)}>
                          <Icon className={cn("h-5 w-5", color)} />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground font-medium">{label}</p>
                          <p className="text-xl font-bold tracking-tight mt-0.5">{value}</p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
            </div>
          )}

          {/* ── Report Table + Chart ─────────────────────────────────────── */}
          <div className={cn("grid grid-cols-1 gap-5", reportType !== "trial-balance" && "lg:grid-cols-3")}>

            {/* Table */}
            <Card className={cn("border-border shadow-sm", reportType !== "trial-balance" ? "lg:col-span-2" : "w-full")}>
              <CardHeader className="px-4 py-3 border-b border-border/60">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  {activeType?.label}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {isFetching ? (
                  <div className="py-20 flex flex-col items-center gap-3">
                    <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                    <span className="text-sm text-muted-foreground">Generating report…</span>
                  </div>
                ) : isError ? (
                  <div className="py-20 text-center text-destructive text-sm">{(error as Error).message}</div>
                ) : (
                  <div className="overflow-x-auto">
                    {reportType === "trial-balance" && data && (
                      <TrialBalanceTable data={data} fmt={fmt} />
                    )}
                    {reportType === "balance-sheet" && data && (
                      <BalanceSheetTable data={data} fmt={fmt} />
                    )}
                    {reportType === "income-statement" && data && (
                      <IncomeStatementTable data={data} fmt={fmt} />
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Chart */}
            {chartData.length > 0 && !isFetching && reportType !== "trial-balance" && (
              <Card className="border-border shadow-sm h-fit">
                <CardHeader className="px-4 py-3 border-b border-border/60">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Visual Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <ResponsiveContainer width="100%" height={reportType === "balance-sheet" ? 320 : 260}>
                    <BarChart data={chartData} margin={{ top: 8, right: 0, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" strokeOpacity={0.4} />
                      <XAxis dataKey="name" fontSize={11} tickLine={false} axisLine={false} tick={{ fill: "var(--foreground)" }} />
                      <YAxis fontSize={11} tickLine={false} axisLine={false} tick={{ fill: "var(--foreground)" }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "var(--popover)",
                          color: "var(--popover-foreground)",
                          borderRadius: "var(--radius)",
                          border: "1px solid var(--border)",
                          fontSize: 12,
                        }}
                        itemStyle={{ color: "var(--popover-foreground)" }}
                        labelStyle={{ color: "var(--popover-foreground)" }}
                        cursor={{ fill: "var(--muted)", fillOpacity: 0.3 }}
                        formatter={(v: any) => [fmt(v * 100), ""]}
                      />
                      <Bar dataKey="amount" radius={[4, 4, 0, 0]} barSize={36} animationDuration={800}>
                        {chartData.map((entry, i) => (
                          <Cell key={i} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Sub-tables ───────────────────────────────────────────────────────────────

function TrialBalanceTable({ data, fmt }: { data: ReportData; fmt: (n: number) => string }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/30 border-b border-border">
          <TableHead className="h-9 text-xs font-semibold">Account</TableHead>
          <TableHead className="h-9 text-xs font-semibold">Category</TableHead>
          <TableHead className="h-9 text-xs font-semibold text-right">Debit</TableHead>
          <TableHead className="h-9 text-xs font-semibold text-right">Credit</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {(data.accounts?.length ?? 0) === 0 ? (
          <TableRow>
            <TableCell colSpan={4} className="py-10 text-center text-muted-foreground italic text-sm">No account data for this period.</TableCell>
          </TableRow>
        ) : (
          data.accounts?.map((acc) => (
            <TableRow key={acc.id} className="hover:bg-muted/20 border-b border-border/40">
              <TableCell className="py-2 text-sm font-medium">{acc.name}</TableCell>
              <TableCell className="py-2 text-xs capitalize text-muted-foreground">{acc.category}</TableCell>
              <TableCell className="py-2 text-right text-sm font-mono">{acc.balance > 0 ? fmt(acc.balance) : <span className="text-muted-foreground/40">—</span>}</TableCell>
              <TableCell className="py-2 text-right text-sm font-mono">{acc.balance < 0 ? fmt(Math.abs(acc.balance)) : <span className="text-muted-foreground/40">—</span>}</TableCell>
            </TableRow>
          ))
        )}
        <TableRow className="bg-muted/20 font-bold border-t-2 border-border">
          <TableCell colSpan={2} className="py-2.5 text-sm">Total</TableCell>
          <TableCell className="py-2.5 text-right text-sm font-mono">{fmt(data.totalDebits ?? 0)}</TableCell>
          <TableCell className="py-2.5 text-right text-sm font-mono">{fmt(Math.abs(data.totalCredits ?? 0))}</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

function BalanceSheetTable({ data, fmt }: { data: ReportData; fmt: (n: number) => string }) {
  const totalAssets  = (data.assets      || []).reduce((s, a) => s + a.balance, 0);
  const totalLiaEq   = (data.liabilities || []).reduce((s, a) => s + a.balance, 0)
                     + (data.equity      || []).reduce((s, a) => s + a.balance, 0);
  const diff         = Math.round(totalAssets + totalLiaEq);
  const isBalanced   = Math.abs(diff) < 1;

  return (
    <div className="divide-y divide-border/60">
      <ReportSection title="Assets"      accounts={data.assets      ?? []} fmt={fmt} normal="debit"  />
      <ReportSection title="Liabilities" accounts={data.liabilities ?? []} fmt={fmt} normal="credit" />
      <ReportSection title="Equity"      accounts={data.equity      ?? []} fmt={fmt} normal="credit" />

      {/* Balance indicator */}
      <div className="p-4">
        <div className={cn(
          "flex items-center justify-between p-3 rounded-lg border text-sm font-medium",
          isBalanced
            ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-600"
            : "bg-destructive/5 border-destructive/20 text-destructive"
        )}>
          <div className="flex items-center gap-2">
            {isBalanced
              ? <CheckCircle2 className="h-4 w-4" />
              : <AlertTriangle className="h-4 w-4" />}
            {isBalanced ? "Balance Sheet is Balanced" : "Balance Sheet is Out of Balance"}
          </div>
          {!isBalanced && (
            <span className="font-mono font-bold">Diff: {fmt(diff)}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function IncomeStatementTable({ data, fmt }: { data: ReportData; fmt: (n: number) => string }) {
  const totalIncome   = (data.income   || []).reduce((s, a) => s + a.balance, 0);
  const totalExpenses = (data.expenses || []).reduce((s, a) => s + a.balance, 0);
  const netIncome     = (totalIncome + totalExpenses) * -1;

  return (
    <div className="divide-y divide-border/60">
      <ReportSection title="Income"   accounts={data.income   ?? []} fmt={fmt} normal="credit" />
      <ReportSection title="Expenses" accounts={data.expenses ?? []} fmt={fmt} normal="debit"  />

      {/* Net income footer */}
      <div className="flex items-center justify-between px-4 py-3 font-bold text-base">
        <span>Net Income</span>
        <span className={netIncome >= 0 ? "text-emerald-600" : "text-destructive"}>{fmt(netIncome)}</span>
      </div>
    </div>
  );
}

// ─── Shared section component ─────────────────────────────────────────────────

function ReportSection({
  title, accounts, fmt, normal = "debit",
}: {
  title: string;
  accounts: AccountBalance[];
  fmt: (n: number) => string;
  normal?: "debit" | "credit";
}) {
  const total = useMemo(() => accounts.reduce((s, a) => s + a.balance, 0), [accounts]);

  return (
    <div>
      <div className="px-4 py-2 bg-muted/20">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</h3>
      </div>
      <Table>
        <TableBody>
          {accounts.length === 0 ? (
            <TableRow>
              <TableCell className="py-3 italic text-muted-foreground text-sm px-4">No {title.toLowerCase()} accounts.</TableCell>
              <TableCell className="py-3 text-right text-muted-foreground text-sm px-4">{fmt(0)}</TableCell>
            </TableRow>
          ) : (
            accounts.map((acc) => (
              <TableRow key={acc.id} className="hover:bg-muted/20 border-b border-border/30">
                <TableCell className="py-2 text-sm px-4">{acc.name}</TableCell>
                <TableCell className={cn(
                  "py-2 text-right text-sm font-mono px-4",
                  acc.balance < 0 && normal === "debit" ? "text-destructive" : ""
                )}>
                  {fmt(normal === "credit" ? acc.balance * -1 : acc.balance)}
                </TableCell>
              </TableRow>
            ))
          )}
          <TableRow className="bg-muted/10 font-semibold">
            <TableCell className="py-2 text-sm px-4">Total {title}</TableCell>
            <TableCell className="py-2 text-right text-sm font-mono border-t border-border px-4">
              {fmt(normal === "credit" ? total * -1 : total)}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
