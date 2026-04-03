"use client";

import { useState, useEffect, useMemo } from "react";
import { useUser } from "@auth0/nextjs-auth0/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from "recharts";
import Link from "next/link";
import { Download, RotateCcw } from "lucide-react";
import { useOrganization } from "@/context/OrganizationContext";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { TagSelector } from "@/components/journals/TagSelector";
import { Suspense } from "react";

import { useLocalStorage } from "@/hooks/use-local-storage";

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

export default function ReportsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Loading reports...</div>}>
      <ReportsInner />
    </Suspense>
  );
}

function ReportsInner() {
  const { user, isLoading: userLoading } = useUser();
  const { activeOrganizationId, permissions, isOwner, isLoading: orgLoading } = useOrganization();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const urlType = searchParams.get("type");

  const [reportType, setReportType] = useLocalStorage(
    activeOrganizationId ? `reports-filters-type-${activeOrganizationId}` : "reports-filters-type-default", 
    "trial-balance"
  );
  const [startDate, setStartDate] = useLocalStorage(
    activeOrganizationId ? `reports-filters-start-${activeOrganizationId}` : "reports-filters-start-default", 
    ""
  );
  const [endDate, setEndDate] = useLocalStorage(
    activeOrganizationId ? `reports-filters-end-${activeOrganizationId}` : "reports-filters-end-default", 
    ""
  );
  const [selectedTagIds, setSelectedTagIds] = useLocalStorage<string[]>(
    activeOrganizationId ? `reports-filters-tags-${activeOrganizationId}` : "reports-filters-tags-default",
    []
  );

  const isLoading = userLoading || orgLoading;
  const canRead = isOwner || permissions.includes("read:reports");

  useEffect(() => {
    if (!isLoading && user && !activeOrganizationId) {
      router.push("/onboarding");
    }
  }, [user, activeOrganizationId, isLoading, router]);

  useEffect(() => {
    if (urlType && ["trial-balance", "balance-sheet", "income-statement"].includes(urlType)) {
      if (reportType !== urlType) {
        setReportType(urlType);
      }
    } else if (reportType && !urlType) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("type", reportType);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }
  }, [urlType, reportType, searchParams, pathname, router, setReportType]);

  const handleTabChange = (value: string | null) => {
    if (!value) return;
    setReportType(value);
    const params = new URLSearchParams(searchParams.toString());
    params.set("type", value);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const handlePdfDownload = () => {
    let url = `/api/reports/pdf?type=${reportType}`;
    if (startDate) url += `&start=${startDate}`;
    if (endDate) url += `&end=${endDate}`;
    if (selectedTagIds.length > 0) url += `&tags=${selectedTagIds.join(",")}`;
    window.open(url, '_blank');
  };

  const { data, isLoading: isFetchingReport, isError, error } = useQuery<ReportData>({
    queryKey: ["reports", activeOrganizationId, reportType, startDate, endDate, selectedTagIds],
    queryFn: async () => {
      let url = `/api/reports?type=${reportType}`;
      if (startDate) url += `&start=${startDate}`;
      if (endDate) url += `&end=${endDate}`;
      if (selectedTagIds.length > 0) url += `&tags=${selectedTagIds.join(",")}`;

      const res = await fetch(url, {
        headers: { "x-org-id": activeOrganizationId! }
      });
      if (!res.ok) throw new Error("Failed to fetch report");
      return res.json();
    },
    enabled: !!activeOrganizationId && canRead,
  });

  const formatCurrency = (amount: number) => {
    // Avoid -0 display by adding 0
    const normalizedAmount = amount === 0 ? 0 : amount;
    return new Intl.NumberFormat("en-BD", {
      style: "currency",
      currency: "BDT",
      minimumFractionDigits: 2,
    }).format(normalizedAmount / 100);
  };

  const chartData = useMemo(() => {
    if (!data) return [];
    if (reportType === "income-statement") {
      const totalIncome = (data.income || []).reduce((sum, item) => sum + Math.abs(item.balance), 0) / 100;
      const totalExpenses = (data.expenses || []).reduce((sum, item) => sum + Math.abs(item.balance), 0) / 100;
      return [
        { name: "Income", amount: totalIncome, fill: "#22c55e" },
        { name: "Expenses", amount: totalExpenses, fill: "#ef4444" },
      ];
    }
    if (reportType === "balance-sheet") {
      const totalAssets = (data.assets || []).reduce((sum, item) => sum + item.balance, 0) / 100;
      const totalLia = (data.liabilities || []).reduce((sum, item) => sum + item.balance, 0) / 100;
      const totalEq = (data.equity || []).reduce((sum, item) => sum + item.balance, 0) / 100;
      return [
        { name: "Assets", amount: totalAssets, fill: "#3b82f6" },
        { name: "Liabilities", amount: Math.abs(totalLia), fill: "#f59e0b" },
        { name: "Equity", amount: Math.abs(totalEq), fill: "#8b5cf6" },
      ];
    }
    return [];
  }, [data, reportType]);

  if (isLoading) return <div className="p-8 text-center">Loading...</div>;

  if (!user) {
    return (
      <div className="p-8 text-center">
        <p className="mb-4">Please log in to view this page.</p>
        <Link href="/auth/login">
          <Button>Log In</Button>
        </Link>
      </div>
    );
  }

  if (!activeOrganizationId) {
    return <div className="p-8 text-center">Redirecting to setup...</div>;
  }

  return (
    <div className="max-w-screen-2xl p-4 md:p-8 space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Financial Reports</h1>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-4 sm:gap-2 w-full sm:w-auto">
          <div className="grid gap-1 w-full sm:w-auto">
            <Label htmlFor="start" className="text-xs">From</Label>
            <Input 
              id="start" 
              type="date" 
              className="h-9 w-full" 
              value={startDate} 
              onChange={(e) => setStartDate(e.target.value)} 
            />
          </div>
          <div className="grid gap-1 w-full sm:w-auto">
            <Label htmlFor="end" className="text-xs">To</Label>
            <Input 
              id="end" 
              type="date" 
              className="h-9 w-full" 
              value={endDate} 
              onChange={(e) => setEndDate(e.target.value)} 
            />
          </div>
          <div className="grid gap-1 w-full sm:w-[200px]">
            <Label htmlFor="tags-filter" className="text-xs">Filter by Tags</Label>
            <TagSelector 
              value={selectedTagIds}
              onChange={setSelectedTagIds}
            />
          </div>
          <Button variant="ghost" className="sm:mb-[2px] h-9 w-full sm:w-auto" onClick={() => { setStartDate(""); setEndDate(""); setSelectedTagIds([]); }}>
             <RotateCcw className="mr-2 h-4 w-4" /> Reset
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {[
          { id: "trial-balance", label: "Trial Balance" },
          { id: "balance-sheet", label: "Balance Sheet" },
          { id: "income-statement", label: "Income Statement" }
        ].map((type) => (
          <Button
            key={type.id}
            variant={reportType === type.id ? "default" : "outline"}
            className="rounded-full shadow-none"
            onClick={() => handleTabChange(type.id)}
          >
            {type.label}
          </Button>
        ))}
      </div>

      <div className="mt-4">
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="capitalize">{reportType.replace("-", " ")}</CardTitle>
              <Button variant="outline" size="sm" onClick={handlePdfDownload}>
                <Download className="h-4 w-4 mr-2" /> Print PDF
              </Button>
            </CardHeader>
            <CardContent>
              {!canRead ? (
                <div className="py-20 text-center text-red-500">
                  You do not have permission to view financial reports.
                </div>
              ) : isFetchingReport ? (
                <div className="py-20 text-center text-neutral-500">Generating report...</div>
              ) : isError ? (
                <div className="py-20 text-center text-red-500">Error: {(error as Error).message}</div>
              ) : (
                <div className="overflow-x-auto">
                  {reportType === "trial-balance" && data && (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Account Name</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead className="text-right">Debit</TableHead>
                          <TableHead className="text-right">Credit</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.accounts?.map((acc) => (
                          <TableRow key={acc.id}>
                            <TableCell>{acc.name}</TableCell>
                            <TableCell className="capitalize text-xs text-muted-foreground">{acc.category}</TableCell>
                            <TableCell className="text-right">{acc.balance > 0 ? formatCurrency(acc.balance) : "-"}</TableCell>
                            <TableCell className="text-right">{acc.balance < 0 ? formatCurrency(Math.abs(acc.balance)) : "-"}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="font-bold border-t-2">
                          <TableCell colSpan={2}>Total</TableCell>
                          <TableCell className="text-right">{formatCurrency(data.totalDebits || 0)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(Math.abs(data.totalCredits || 0))}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  )}

                  {reportType === "balance-sheet" && data && (
                    <div className="space-y-6">
                      <ReportSection title="Assets" accounts={data.assets || []} format={formatCurrency} normal="debit" />
                      <ReportSection title="Liabilities" accounts={data.liabilities || []} format={formatCurrency} normal="credit" />
                      <ReportSection title="Equity" accounts={data.equity || []} format={formatCurrency} normal="credit" />
                      
                      <div className="pt-6 border-t-2 space-y-4">
                        <div className="flex flex-col sm:flex-row justify-between gap-4">
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Assets</p>
                            <p className="text-xl font-bold">{formatCurrency((data.assets || []).reduce((s, a) => s + a.balance, 0))}</p>
                          </div>
                          <div className="space-y-1 sm:text-right">
                            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Liabilities & Equity</p>
                            <p className="text-xl font-bold">
                              {formatCurrency(
                                ((data.liabilities || []).reduce((s, a) => s + a.balance, 0) + 
                                (data.equity || []).reduce((s, a) => s + a.balance, 0)) * -1
                              )}
                            </p>
                          </div>
                        </div>

                        {(() => {
                          const totalAssets = (data.assets || []).reduce((s, a) => s + a.balance, 0);
                          const totalLiaEqBalances = (data.liabilities || []).reduce((s, a) => s + a.balance, 0) + (data.equity || []).reduce((s, a) => s + a.balance, 0);
                          
                          const diff = Math.round(totalAssets + totalLiaEqBalances);
                          const isBalanced = Math.abs(diff) < 1; // within 1 cent/unit for rounding

                          return (
                            <div className={`p-4 rounded-lg flex items-center justify-between ${isBalanced ? "bg-green-50 border border-green-100" : "bg-red-50 border border-red-100"}`}>
                              <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${isBalanced ? "bg-green-500" : "bg-red-500 animate-pulse"}`} />
                                <span className={`font-semibold ${isBalanced ? "text-green-700" : "text-red-700"}`}>
                                  {isBalanced ? "Balance Sheet is Balanced" : "Balance Sheet is Out of Balance"}
                                </span>
                              </div>
                              {!isBalanced && (
                                <span className="text-red-600 font-mono font-bold">
                                  Diff: {formatCurrency(diff)}
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  )}

                  {reportType === "income-statement" && data && (
                    <div className="space-y-6">
                      <ReportSection title="Income" accounts={data.income || []} format={formatCurrency} normal="credit" />
                      <ReportSection title="Expenses" accounts={data.expenses || []} format={formatCurrency} normal="debit" />
                      
                      <div className="pt-4 border-t-2 flex justify-between font-bold text-lg">
                        <span>Net Income</span>
                        {(() => {
                          const totalIncome = (data.income || []).reduce((s, a) => s + a.balance, 0);
                          const totalExpenses = (data.expenses || []).reduce((s, a) => s + a.balance, 0);
                          // Net Income = Income (credit) - Expenses (debit). 
                          // In our DB, income is negative, expenses positive.
                          // So Net Income (Credit) = (Sum(Income) + Sum(Expenses))
                          // We want to show positive for Profit (Net Credit)
                          const netIncome = (totalIncome + totalExpenses) * -1;
                          
                          return (
                            <span className={netIncome >= 0 ? "text-green-600" : "text-red-600"}>
                              {formatCurrency(netIncome)}
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
    </div>
  );
}

function ReportSection({ title, accounts, format, normal = "debit" }: { title: string, accounts: AccountBalance[], format: (v: number) => string, normal?: "debit" | "credit" }) {
  const total = useMemo(() => accounts.reduce((sum, acc) => sum + acc.balance, 0), [accounts]);
  return (
    <div className="space-y-2">
      <h3 className="font-semibold text-lg border-b pb-1">{title}</h3>
      <Table>
        <TableBody>
          {accounts.map(acc => (
            <TableRow key={acc.id} className="border-none hover:bg-transparent">
              <TableCell className="py-1">{acc.name}</TableCell>
              <TableCell className={`text-right py-1 font-mono ${acc.balance < 0 && normal === "debit" ? "text-red-600" : ""}`}>
                {format(normal === "credit" ? (acc.balance === 0 ? 0 : acc.balance * -1) : acc.balance)}
              </TableCell>
            </TableRow>
          ))}
          {accounts.length === 0 && (
            <TableRow className="border-none">
              <TableCell className="text-neutral-400 italic py-1">No items found</TableCell>
              <TableCell className="text-right py-1">{format(0)}</TableCell>
            </TableRow>
          )}
          <TableRow className="font-bold">
            <TableCell>Total {title}</TableCell>
            <TableCell className="text-right border-t">
              {format(normal === "credit" ? (total === 0 ? 0 : total * -1) : total)}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
