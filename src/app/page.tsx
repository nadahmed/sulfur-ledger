"use client";

import { useOrganization } from "@/context/OrganizationContext";
import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthGuard } from "@/hooks/use-auth-guard";
import { useQuery } from "@tanstack/react-query";
import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardDescription, 
  CardContent 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  PieChart,
  Pie,
  Legend,
  LineChart,
  Line
} from "recharts";
import { formatCurrency, cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Plus
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
  incomeStats: { name: string; amount: number; fill: string }[];
}

export default function DashboardPage() {
  const { user, isLoading: isUserLoading } = useAuthGuard();
  const { activeOrganizationId, organizations, isLoading: isOrgLoading } = useOrganization();
  const activeOrg = organizations.find(o => o.id === activeOrganizationId);
  const router = useRouter();
  
  const [persistedDate, setPersistedDate] = useLocalStorage<{ from: string | undefined; to: string | undefined }>(
    activeOrganizationId ? `dash-filters-date-${activeOrganizationId}` : "dash-filters-date-default",
    {
      from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
      to: new Date().toISOString(),
    }
  );

  const date = useMemo(() => ({
    from: persistedDate.from ? new Date(persistedDate.from) : undefined,
    to: persistedDate.to ? new Date(persistedDate.to) : undefined,
  }), [persistedDate]);

  const setDate = (range: any) => {
    setPersistedDate({
      from: range?.from?.toISOString(),
      to: range?.to?.toISOString(),
    });
  };

  const [isMounted, setIsMounted] = useState(false);
  const [trendPeriod, setTrendPeriod] = useLocalStorage<"weeks" | "months" | "years">(
    activeOrganizationId ? `dash-filters-trend-period-${activeOrganizationId}` : "dash-filters-trend-period-default", 
    "weeks"
  );
  const [trendCount, setTrendCount] = useLocalStorage<number>(
    activeOrganizationId ? `dash-filters-trend-count-${activeOrganizationId}` : "dash-filters-trend-count-default",
    6
  );

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
    queryKey: ["dashboard-trend", activeOrganizationId, trendPeriod, trendCount],
    queryFn: async () => {
      const res = await fetch(`/api/reports?type=trend&period=${trendPeriod}&count=${trendCount}`, {
        headers: { "x-org-id": activeOrganizationId! }
      });
      if (!res.ok) throw new Error("Failed to fetch trend data");
      return res.json();
    },
    enabled: !!activeOrganizationId,
  });

  const formatCurrencyValue = (amount: number) => {
    return formatCurrency(
      amount / 100, 
      activeOrg?.currencySymbol, 
      activeOrg?.currencyPosition, 
      activeOrg?.currencyHasSpace
    );
  };

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading...</div>;

  if (!user) {
    router.push("/auth/login");
    return null;
  }

  if (!activeOrganizationId) {
    router.push("/onboarding");
    return null;
  }

  return (
    <div className="max-w-screen-2xl p-4 md:p-8 space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Welcome back, {user.name}. Here&apos;s your financial overview.</p>
        </div>
        
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger render={
              <Button
                variant="outline"
                className={cn(
                  "w-[260px] justify-start text-left font-normal",
                  !date && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {date?.from ? (
                  date.to ? (
                    <>
                      {format(date.from, "LLL dd, y")} -{" "}
                      {format(date.to, "LLL dd, y")}
                    </>
                  ) : (
                    format(date.from, "LLL dd, y")
                  )
                ) : (
                  <span>Pick a date range</span>
                )}
              </Button>
            } />
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                initialFocus
                mode="range"
                defaultMonth={date?.from}
                selected={date}
                onSelect={(range: any) => setDate(range)}
                numberOfMonths={2}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="shadow-sm border-neutral-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Cash Balance</CardTitle>
            <Wallet className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary ? formatCurrencyValue(summary.cashBalance) : (
                activeOrg?.currencyPosition === "suffix" 
                  ? `0${activeOrg?.currencySymbol || "৳"}` 
                  : `${activeOrg?.currencySymbol || "৳"}0`
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Available liquidity</p>
          </CardContent>
        </Card>
        
        <Card className="shadow-sm border-neutral-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Net Income</CardTitle>
            {summary && summary.netIncome >= 0 ? (
              <TrendingUp className="h-4 w-4 text-green-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-500" />
            )}
          </CardHeader>
          <CardContent>
            <div className={cn("text-2xl font-bold", summary && summary.netIncome < 0 ? "text-red-600" : "text-green-600")}>
              {summary ? formatCurrencyValue(summary.netIncome) : (
                activeOrg?.currencyPosition === "suffix" 
                  ? `0${activeOrg?.currencySymbol || "৳"}` 
                  : `${activeOrg?.currencySymbol || "৳"}0`
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">For selected period</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-neutral-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Income</CardTitle>
            <ArrowUpRight className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary ? formatCurrencyValue(summary.totalIncome) : (
                activeOrg?.currencyPosition === "suffix" 
                  ? `0${activeOrg?.currencySymbol || "৳"}` 
                  : `${activeOrg?.currencySymbol || "৳"}0`
              )}
            </div>
            <p className="text-xs text-emerald-600 mt-1 font-medium">Revenue streams</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-neutral-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Expenses</CardTitle>
            <ArrowDownRight className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {summary ? formatCurrencyValue(summary.totalExpenses) : (
                activeOrg?.currencyPosition === "suffix" 
                  ? `0${activeOrg?.currencySymbol || "৳"}` 
                  : `${activeOrg?.currencySymbol || "৳"}0`
              )}
            </div>
            <p className="text-xs text-orange-500 mt-1 font-medium">Operational costs</p>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm border-neutral-200">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-indigo-500" />
              Financial Trends
            </CardTitle>
            <CardDescription>Income and expense trajectory over time</CardDescription>
          </div>
          <div className="flex items-center gap-2 self-end">
            <Select value={trendPeriod} onValueChange={(v) => v && setTrendPeriod(v as any)}>
              <SelectTrigger className="w-[110px] h-8 text-xs">
                <SelectValue placeholder="Period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="weeks">Weeks</SelectItem>
                <SelectItem value="months">Months</SelectItem>
                <SelectItem value="years">Years</SelectItem>
              </SelectContent>
            </Select>
            <Select value={trendCount.toString()} onValueChange={(v) => v && setTrendCount(parseInt(v))}>
              <SelectTrigger className="w-[70px] h-8 text-xs">
                <SelectValue placeholder="Count" />
              </SelectTrigger>
              <SelectContent>
                {[3, 6, 12, 24].map(n => (
                  <SelectItem key={n} value={n.toString()}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
           <div className="h-[300px] w-full min-h-0 min-w-0">
            {isMounted && trendData ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.5} />
                  <XAxis 
                    dataKey="label" 
                    fontSize={12} 
                    tickLine={false} 
                    axisLine={false}
                    padding={{ left: 10, right: 10 }}
                  />
                  <YAxis 
                    fontSize={12} 
                    tickLine={false} 
                    axisLine={false}
                    tickFormatter={(value) => {
                      const symbol = activeOrg?.currencySymbol || "৳";
                      const pos = activeOrg?.currencyPosition || "prefix";
                      return pos === "prefix" ? `${symbol}${value}` : `${value}${symbol}`;
                    }}
                  />
                  <Tooltip 
                    formatter={(value: any) => [formatCurrencyValue(value * 100), ""]}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  />
                  <Legend 
                    verticalAlign="top" 
                    height={36} 
                    align="right"
                    iconType="circle"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="income" 
                    stroke="#22c55e" 
                    strokeWidth={2.5} 
                    dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} 
                    activeDot={{ r: 6, strokeWidth: 0 }}
                    name="Income"
                    animationDuration={1500}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="expense" 
                    stroke="#ef4444" 
                    strokeWidth={2.5} 
                    dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} 
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

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        <Card className="lg:col-span-4 shadow-sm border-neutral-200">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-500" />
              Income vs Expenses
            </CardTitle>
            <CardDescription>Comparison of revenue and outflow for the period</CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            <div className="h-[350px] w-full min-h-0 min-w-0">
              {isMounted && summary ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={summary.incomeStats}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip 
                      formatter={(value: any) => [formatCurrencyValue(value * 100), "Amount"]}
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                    />
                    <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                      {summary.incomeStats.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full w-full flex items-center justify-center text-muted-foreground animate-pulse bg-muted/20 rounded-lg">
                  {isMounted && !summary ? "Loading chart..." : ""}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3 shadow-sm border-neutral-200">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <PieChartIcon className="h-5 w-5 text-purple-500" />
              Asset Distribution
            </CardTitle>
            <CardDescription>Breakdown of current asset categories</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[400px] w-full min-h-0 min-w-0">
              {isMounted && summary && summary.assetDistribution.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={summary.assetDistribution}
                      cx="50%"
                      cy="45%"
                      innerRadius={70}
                      outerRadius={100}
                      paddingAngle={5}
                      dataKey="value"
                      label={({ name, percent }) => `${name}: ${((percent || 0) * 100).toFixed(0)}%`}
                      labelLine={true}
                    >
                      {summary.assetDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value: any) => [formatCurrencyValue(value * 100), "Value"]}
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                    />
                    <Legend 
                      verticalAlign="bottom" 
                      align="center"
                      iconType="circle"
                      wrapperStyle={{ fontSize: '12px', paddingTop: '20px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full w-full flex items-center justify-center text-muted-foreground italic">
                  {isMounted && summary?.assetDistribution.length === 0 ? "No asset data available" : (isMounted ? "" : "")}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-2">
         <Card className="shadow-sm border-neutral-200">
            <CardHeader>
              <CardTitle>Accountant Insights</CardTitle>
              <CardDescription>Key observations for your organization</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-start gap-4 p-3 rounded-lg bg-blue-50 border border-blue-100">
                  <div className="mt-1"><Wallet className="h-5 w-5 text-blue-600" /></div>
                  <div>
                    <h4 className="font-semibold text-blue-900">Liquidity Status</h4>
                    <p className="text-sm text-blue-700">
                      Your current cash balance is {summary ? formatCurrencyValue(summary.cashBalance) : (
                        activeOrg?.currencyPosition === "suffix" 
                          ? `0${activeOrg?.currencySymbol || "৳"}` 
                          : `${activeOrg?.currencySymbol || "৳"}0`
                      )}. 
                      Ensure this covers upcoming liabilities and operational needs.
                    </p>
                  </div>
                </div>
                
                <div className={cn(
                  "flex items-start gap-4 p-3 rounded-lg border",
                  summary && summary.netIncome >= 0 
                    ? "bg-green-50 border-green-100" 
                    : "bg-red-50 border-red-100"
                )}>
                  <div className="mt-1">
                    {summary && summary.netIncome >= 0 
                      ? <TrendingUp className="h-5 w-5 text-green-600" /> 
                      : <TrendingDown className="h-5 w-5 text-red-600" />}
                  </div>
                  <div>
                    <h4 className={cn(
                      "font-semibold", 
                      summary && summary.netIncome >= 0 ? "text-green-900" : "text-red-900"
                    )}>
                      Profitability
                    </h4>
                    <p className={cn(
                      "text-sm",
                      summary && summary.netIncome >= 0 ? "text-green-700" : "text-red-700"
                    )}>
                      {summary 
                        ? (summary.netIncome >= 0 
                          ? `Great! You have a net profit of ${formatCurrencyValue(summary.netIncome)} for this period.`
                          : `Warning: You have a net loss of ${formatCurrencyValue(summary.netIncome)} for this period.`)
                        : "Calculating profitability..."
                      }
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
         </Card>

         <Card className="shadow-sm border-neutral-200">
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Commonly used ledger functions</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <Button variant="outline" className="h-20 flex flex-col gap-2" onClick={() => router.push("/journals")}>
                <ArrowUpRight className="h-5 w-5" />
                New Journal
              </Button>
              <Button variant="outline" className="h-20 flex flex-col gap-2" onClick={() => router.push("/accounts")}>
                <Building2 className="h-5 w-5" />
                Add Account
              </Button>
              <Button variant="outline" className="h-20 flex flex-col gap-2" onClick={() => router.push("/reports")}>
                <PieChartIcon className="h-5 w-5" />
                View Reports
              </Button>
              <Button variant="outline" className="h-20 flex flex-col gap-2" onClick={() => router.push("/settings")}>
                <Settings className="h-5 w-5" />
                Org Settings
              </Button>
            </CardContent>
         </Card>
      </div>
    </div>
  );
}

