"use client";

import { useEffect, useState, useMemo } from "react";
import { useUser } from "@auth0/nextjs-auth0/client";
import { useOrganization } from "@/context/OrganizationContext";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { useQuery } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  BarChart3,
  PieChart as PieChartIcon,
  Calendar as CalendarIcon,
  ArrowUpRight,
  ArrowDownRight,
  Building2,
  Settings,
  LogOut,
  Plus,
  History,
  Bot,
  FileText,
  Edit,
  Trash2,
  MoreVertical
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { useLocalStorage } from "@/hooks/use-local-storage";

interface DashboardSummary {
  totalAssets: number;
  netIncome: number;
  totalIncome: number;
  totalExpenses: number;
  cashBalance: number;
  assetDistribution: { name: string; value: number; fill: string }[];
  expenseDistribution: { name: string; value: number; fill: string }[];
  incomeStats: { name: string; amount: number; fill: string }[];
}

export default function DashboardPage() {
  const { user, isLoading: isUserLoading } = useUser();
  const { activeOrganizationId, organizations, isLoading: isOrgLoading } = useOrganization();
  const activeOrg = organizations.find(o => o.id === activeOrganizationId);
  const router = useRouter();

  const [persistedDate, setPersistedDate] = useLocalStorage<{ from: string | undefined; to: string | undefined }>(
    activeOrganizationId ? `dash-filters-date-${activeOrganizationId}` : "dash-filters-date-default",
    { from: undefined, to: undefined }
  );

  const [trendPeriod, setTrendPeriod] = useLocalStorage<"days" | "weeks" | "months" | "years">(
    activeOrganizationId ? `dash-filters-period-${activeOrganizationId}` : "dash-filters-period-default",
    "months"
  );

  const date = useMemo(() => ({
    from: persistedDate.from ? new Date(persistedDate.from) : undefined,
    to: persistedDate.to ? new Date(persistedDate.to) : undefined,
  }), [persistedDate]);

  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const isLoading = isUserLoading || isOrgLoading;

  const { data: summary, isLoading: isFetching } = useQuery<DashboardSummary>({
    queryKey: ["dashboard-summary", activeOrganizationId, date.from, date.to],
    queryFn: async () => {
      const start = date.from ? format(date.from, "yyyy-MM-dd") : "";
      const end = date.to ? format(date.to, "yyyy-MM-dd") : "";
      const res = await fetch(`/api/reports?type=dashboard&start=${start}&end=${end}`, {
        headers: { "x-org-id": activeOrganizationId! }
      });
      if (!res.ok) throw new Error("Failed to fetch dashboard data");
      return res.json();
    },
    enabled: !!activeOrganizationId,
  });

  const { data: trendData, isLoading: isTrendLoading } = useQuery({
    queryKey: ["dashboard-trend", activeOrganizationId, trendPeriod, date.from, date.to],
    queryFn: async () => {
      const start = date.from ? format(date.from, "yyyy-MM-dd") : "";
      const end = date.to ? format(date.to, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd");
      const res = await fetch(`/api/reports?type=trend&period=${trendPeriod}&start=${start}&end=${end}`, {
        headers: { "x-org-id": activeOrganizationId! }
      });
      if (!res.ok) throw new Error("Failed to fetch trend data");
      return res.json();
    },
    enabled: !!activeOrganizationId,
  });
  
  const { data: recentActivity, isLoading: isActivityLoading } = useQuery<any[]>({
    queryKey: ["dashboard-activity", activeOrganizationId],
    queryFn: async () => {
      const res = await fetch(`/api/activity?orgId=${activeOrganizationId}`, {
        headers: { "x-org-id": activeOrganizationId! }
      });
      if (!res.ok) throw new Error("Failed to fetch activity");
      const data = await res.json();
      return Array.isArray(data) ? data.slice(0, 3) : [];
    },
    enabled: !!activeOrganizationId,
  });

  const formatCurrencyValue = (amount: number) => {
    return formatCurrency(
      amount / 100,
      activeOrg?.currencySymbol,
      activeOrg?.currencyPosition,
      activeOrg?.currencyHasSpace,
      activeOrg?.thousandSeparator,
      activeOrg?.decimalSeparator,
      activeOrg?.grouping as any,
      activeOrg?.decimalPlaces
    );
  };

  if (isLoading) return <div className="p-6">Loading...</div>;
  if (!activeOrganizationId) return <div className="p-6 text-center mt-20">Please select an organization from the sidebar.</div>;

  return (
    <div className="flex-1 space-y-4 p-4 md:p-6 min-h-screen bg-transparent">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            Dashboard
            <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          </h2>
          <p className="text-muted-foreground">
            Financial overview for <span className="font-medium text-foreground">{activeOrg?.name}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Popover>
            <PopoverTrigger
              render={
                <button className="flex items-center gap-2 px-3 py-2 rounded-md bg-card border border-border text-sm font-medium hover:bg-muted/50 transition-colors shadow-sm">
                  <CalendarIcon className="h-4 w-4 text-primary" />
                  {date.from ? (
                    date.to ? (
                      <>
                        {format(date.from, "LLL dd, y")} -{" "}
                        {format(date.to, "LLL dd, y")}
                      </>
                    ) : (
                      "All time"
                    )
                  ) : (
                    "All time"
                  )}
                </button>
              }
            />
            <PopoverContent className="w-auto p-0 border-none" align="end">
              <div className="bg-card border border-border rounded-lg shadow-2xl p-4 space-y-4">
                <Calendar
                  initialFocus
                  mode="range"
                  defaultMonth={date.from}
                  selected={{ from: date.from, to: date.to }}
                  onSelect={(range) => {
                    setPersistedDate({
                      from: range?.from?.toISOString(),
                      to: range?.to?.toISOString(),
                    });
                  }}
                  numberOfMonths={2}
                  className="rounded-md border border-border"
                />
                <div className="flex justify-end gap-2 pt-2 border-t border-border">
                  <button
                    onClick={() => setPersistedDate({ from: undefined, to: undefined })}
                    className="text-xs px-3 py-1.5 rounded-md hover:bg-muted transition-colors font-medium"
                  >
                    All time
                  </button>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <button
            onClick={() => router.push("/journals")}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity shadow-lg shadow-primary/20"
          >
            <Plus className="h-4 w-4" />
            New Entry
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[
          {
            title: "Total Assets",
            value: summary?.totalAssets || 0,
            icon: Building2,
            desc: "Current positions",
            color: "text-primary",
            bg: "bg-primary/10"
          },
          {
            title: "Total Income",
            value: summary?.totalIncome || 0,
            icon: TrendingUp,
            desc: "Period revenue",
            color: "text-emerald-500",
            bg: "bg-emerald-500/10"
          },
          {
            title: "Total Expenses",
            value: summary?.totalExpenses || 0,
            icon: TrendingDown,
            desc: "Period outflow",
            color: "text-rose-500",
            bg: "bg-rose-500/10"
          },
          {
            title: "Net Income",
            value: summary?.netIncome || 0,
            icon: Wallet,
            desc: "Period profit/loss",
            color: (summary?.netIncome || 0) >= 0 ? "text-primary" : "text-destructive",
            bg: (summary?.netIncome || 0) >= 0 ? "bg-primary/10" : "bg-destructive/10"
          },
        ].map((card, i) => (
          <Card key={i} className="shadow-xl border-border bg-card/30 backdrop-blur-sm overflow-hidden group hover:border-primary/50 transition-all text-card-foreground">
            <div className={`absolute top-0 left-0 w-1 h-full ${card.bg.replace('/10', '')}`} />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
              <div className={`p-2 rounded-lg ${card.bg} group-hover:scale-110 transition-transform`}>
                <card.icon className={`h-4 w-4 ${card.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tracking-tight">
                {summary ? formatCurrencyValue(card.value) : (
                  <div className="h-8 w-24 bg-muted animate-pulse rounded" />
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{card.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="shadow-2xl border-border bg-card/30 backdrop-blur-sm">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2">
          <div>
            <CardTitle className="text-xl font-bold flex items-center gap-2">
              Financial Trends
            </CardTitle>
            <CardDescription>Income and Expense flow over time</CardDescription>
          </div>
          <div className="flex items-center bg-muted/30 p-1 rounded-lg border border-border w-full sm:w-auto overflow-x-auto no-scrollbar shrink-0">
            {["days", "weeks", "months", "years"].map((p) => (
              <button
                key={p}
                onClick={() => setTrendPeriod(p as any)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${trendPeriod === p
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                  }`}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[320px] w-full mt-4">
            {isMounted && trendData ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" strokeOpacity={0.5} />
                  <XAxis
                    dataKey="label"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: 'var(--muted-foreground)' }}
                    minTickGap={30}
                  />
                  <YAxis
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(val) => `৳${val > 1000 ? (val / 1000).toFixed(0) + 'k' : val}`}
                    tick={{ fill: 'var(--muted-foreground)' }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--popover)',
                      borderRadius: 'var(--radius)',
                      border: '1px solid var(--border)',
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                      padding: '8px 12px'
                    }}
                    labelStyle={{ color: 'var(--popover-foreground)', fontWeight: '600', marginBottom: '8px' }}
                    itemStyle={{ padding: '2px 0' }}
                    formatter={(value: any) => [`৳${value.toLocaleString()}`, ""]}
                  />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    iconType="circle"
                    wrapperStyle={{ paddingBottom: '20px', fontSize: '12px' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="income"
                    stroke="hsl(142, 70%, 45%)"
                    strokeWidth={3}
                    dot={{ r: 0 }}
                    activeDot={{ r: 6, strokeWidth: 0 }}
                    name="Income"
                    animationDuration={1500}
                  />
                  <Line
                    type="monotone"
                    dataKey="expense"
                    stroke="hsl(0, 70%, 60%)"
                    strokeWidth={3}
                    dot={{ r: 0 }}
                    activeDot={{ r: 6, strokeWidth: 0 }}
                    name="Expense"
                    animationDuration={1500}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full w-full flex items-center justify-center text-muted-foreground animate-pulse bg-muted/20 rounded-lg border-2 border-dashed border-muted">
                {isMounted ? "Loading trend analysis..." : ""}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="shadow-2xl border-border bg-card/30 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <PieChartIcon className="h-5 w-5 text-primary" />
              Asset Distribution
            </CardTitle>
            <CardDescription>Breakdown of current asset categories</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[260px] w-full">
              {isMounted && summary && summary.assetDistribution.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={summary.assetDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={85}
                      paddingAngle={5}
                      dataKey="value"
                      stroke="none"
                    >
                      {summary.assetDistribution.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} className="hover:opacity-80 transition-opacity cursor-pointer" />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--popover)',
                        borderRadius: 'var(--radius)',
                        border: '1px solid var(--border)',
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                        padding: '8px 12px'
                      }}
                      labelStyle={{ color: 'var(--popover-foreground)', fontWeight: '600', marginBottom: '4px' }}
                      itemStyle={{ color: 'var(--primary)', padding: '0' }}
                      formatter={(value: any) => [formatCurrencyValue(value * 100), ""]}
                    />
                    <Legend
                      verticalAlign="bottom"
                      align="center"
                      iconType="circle"
                      wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full w-full flex items-center justify-center text-muted-foreground italic text-sm">
                  {isMounted && summary?.assetDistribution.length === 0 ? "No asset data" : ""}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-2xl border-border bg-card/30 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-destructive" />
              Expense Distribution
            </CardTitle>
            <CardDescription>Top spending categories for the period</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[260px] w-full">
              {isMounted && summary && summary.expenseDistribution.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={summary.expenseDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={85}
                      paddingAngle={5}
                      dataKey="value"
                      stroke="none"
                    >
                      {summary.expenseDistribution.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} className="hover:opacity-80 transition-opacity cursor-pointer" />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--popover)',
                        borderRadius: 'var(--radius)',
                        border: '1px solid var(--border)',
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                        padding: '8px 12px'
                      }}
                      labelStyle={{ color: 'var(--popover-foreground)', fontWeight: '600', marginBottom: '4px' }}
                      itemStyle={{ color: 'var(--primary)', padding: '0' }}
                      formatter={(value: any) => [formatCurrencyValue(value * 100), ""]}
                    />
                    <Legend
                      verticalAlign="bottom"
                      align="center"
                      iconType="circle"
                      wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full w-full flex items-center justify-center text-muted-foreground italic text-sm">
                  {isMounted && summary?.expenseDistribution.length === 0 ? "No expense data" : ""}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-2xl border-border bg-card/30 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Income vs Expenses
            </CardTitle>
            <CardDescription>Net performance comparison</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[260px] w-full">
              {isMounted && summary ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={summary.incomeStats} margin={{ top: 20, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" strokeOpacity={0.3} />
                    <XAxis dataKey="name" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--popover)',
                        borderRadius: 'var(--radius)',
                        border: '1px solid var(--border)',
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                        padding: '8px 12px'
                      }}
                      labelStyle={{ color: 'var(--popover-foreground)', fontWeight: '600', marginBottom: '4px' }}
                      itemStyle={{ color: 'var(--primary)', padding: '0' }}
                      formatter={(value: any) => [formatCurrencyValue(value * 100), ""]}
                      cursor={{ fill: 'var(--muted)', fillOpacity: 0.2 }}
                    />
                    <Bar dataKey="amount" radius={[4, 4, 0, 0]} barSize={40} animationDuration={1000}>
                      {summary.incomeStats.map((entry: any, index: number) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.fill}
                          className="hover:opacity-80 transition-opacity cursor-pointer"
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full w-full flex items-center justify-center text-muted-foreground italic text-sm">
                  {isMounted && !summary ? "Loading..." : ""}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-2">
        <Card className="shadow-2xl border-border bg-card/30 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Accountant Insights</CardTitle>
            <CardDescription>Key observations for your organization</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-start gap-4 p-3 rounded-lg bg-muted/30 border border-border">
                <div className="mt-1"><Wallet className="h-5 w-5 text-primary" /></div>
                <div>
                  <h4 className="font-semibold text-foreground">Liquidity Status</h4>
                  <p className="text-sm text-muted-foreground">
                    Your cash balance of <span className="font-medium text-foreground">{summary ? formatCurrencyValue(summary.cashBalance) : "..."}</span> shows
                    {(summary?.cashBalance || 0) > (summary?.totalExpenses || 0) * 0.5 ? " a healthy runway." : " limited coverage for current expenses."}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4 p-3 rounded-lg bg-muted/30 border border-border">
                <div className="mt-1"><BarChart3 className="h-5 w-5 text-emerald-500" /></div>
                <div>
                  <h4 className="font-semibold text-foreground">Profitability</h4>
                  <p className="text-sm text-muted-foreground">
                    Net income is <span className={`font-medium ${(summary?.netIncome || 0) >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                      {summary ? formatCurrencyValue(summary.netIncome) : "..."}
                    </span> for this period.
                    {(summary?.netIncome || 0) > 0 ? " You are operating profitably." : " Review your expense distribution to optimize costs."}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-2xl border-border bg-card/30 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="space-y-1">
              <CardTitle className="text-lg flex items-center gap-2">
                <History className="h-5 w-5 text-primary" />
                Recent Activity
              </CardTitle>
              <CardDescription>Latest actions in this organization</CardDescription>
            </div>
            <button
              onClick={() => router.push("/app/activity")}
              className="text-xs text-primary hover:underline font-medium"
            >
              See all
            </button>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {isMounted && !isActivityLoading && recentActivity && recentActivity.length > 0 ? (
                recentActivity.map((log: any) => (
                  <div key={log.id} className="flex items-start gap-4 p-2 rounded-lg hover:bg-muted/30 transition-colors group">
                    <div className="mt-1 p-2 rounded-full bg-muted border border-border group-hover:border-primary/30 transition-colors">
                      {log.type === "mcp" ? (
                        <Bot className="h-3.5 w-3.5 text-primary" />
                      ) : log.action === "create" ? (
                        <Plus className="h-3.5 w-3.5 text-emerald-500" />
                      ) : log.action === "update" ? (
                        <Edit className="h-3.5 w-3.5 text-blue-500" />
                      ) : log.action === "delete" ? (
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      ) : (
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-none text-foreground truncate">
                        {log.type === "mcp" ? (
                          <>AI used <span className="font-bold">{log.toolName}</span></>
                        ) : (
                          <>{log.action.charAt(0).toUpperCase() + log.action.slice(1)} {log.entityType}</>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {log.type === "mcp" ? log.input : log.details}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider font-semibold">
                        {log.userName || "System"} • {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))
              ) : isMounted && !isActivityLoading && recentActivity?.length === 0 ? (
                <div className="h-20 flex items-center justify-center text-sm text-muted-foreground italic border-2 border-dashed border-muted rounded-lg">
                  No recent activity found.
                </div>
              ) : (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-4">
                      <div className="h-8 w-8 rounded-full bg-muted animate-pulse" />
                      <div className="space-y-2 flex-1">
                        <div className="h-3 w-2/3 bg-muted animate-pulse rounded" />
                        <div className="h-2 w-1/3 bg-muted animate-pulse rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
