"use client";

import { useUser } from "@auth0/nextjs-auth0/client";
import { useOrganization } from "@/context/OrganizationContext";
import { Header } from "@/components/Header";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";

const parseCSVLine = (line: string) => {
  // Simple CSV parser for quoted fields
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"' && line[i+1] === '"') {
          current += '"';
          i++;
      } else if (char === '"') {
          inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
          result.push(current);
          current = "";
      } else {
          current += char;
      }
  }
  result.push(current);
  return result;
};

const parseCSV = (csv: string) => {
  const lines = csv.split(/\r?\n/).filter(line => line.trim() !== "");
  if (lines.length < 2) return [];
  
  const headers = parseCSVLine(lines[0]).map(h => h.trim());
  return lines.slice(1).map(line => {
    const values = parseCSVLine(line);
    const obj: any = {};
    headers.forEach((header, i) => {
      obj[header] = values[i]?.trim();
    });
    return obj;
  }).filter(row => row["Date"] && row["Amount"] && row["From (Source)"] && row["To (Destination)"]);
};

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function Home() {
  const { user, isLoading: isUserLoading } = useUser();
  const { activeOrganizationId, isLoading: isOrgLoading, organizations } = useOrganization();
  const router = useRouter();
  const [summary, setSummary] = useState<{ totalAssets: number; netIncome: number } | null>(null);
  const [importProgress, setImportProgress] = useState<{
    total: number;
    current: number;
    status: string;
    isImporting: boolean;
  }>({ total: 0, current: 0, status: "", isImporting: false });

  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  const isLoading = isUserLoading || isOrgLoading;

  useEffect(() => {
    if (!isLoading && user && !activeOrganizationId) {
      router.push("/onboarding");
    }
  }, [user, activeOrganizationId, isLoading, router]);

  useEffect(() => {
    if (user && activeOrganizationId) {
      fetch("/api/reports?type=summary", {
        headers: { "x-org-id": activeOrganizationId }
      })
        .then(res => res.json())
        .then(data => setSummary(data))
        .catch(err => console.error("Summary fetch error:", err));
    }
  }, [user, activeOrganizationId]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-BD", {
      style: "currency",
      currency: "BDT",
      minimumFractionDigits: 0,
    }).format(Math.abs(amount) / 100);
  };

  const handleClearData = async () => {
    try {
      const res = await fetch("/api/admin/clear-data", { method: "POST" });
      if (res.ok) {
        toast.success("Data cleared successfully. Refreshing...");
        setTimeout(() => window.location.reload(), 1000);
      } else {
        const error = await res.json();
        toast.error(`Error: ${error.error}`);
      }
    } catch (err) {
      toast.error("An unexpected error occurred.");
    }
  };

  if (isLoading) return <div className="p-8">Loading...</div>;

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-neutral-50 p-4 font-sans">
        <h1 className="text-4xl font-bold mb-4">Simple Ledger</h1>
        <p className="text-lg text-neutral-600 mb-8 font-sans">A double-entry bookkeeping application for precise tracking.</p>
        <Link href="/auth/login">
          <Button size="lg">Log In</Button>
        </Link>
      </div>
    );
  }

  // If we are logged in but don't have an org yet, useEffect will redirect.
  // Show a loading/empty state in the meantime.
  if (!activeOrganizationId) {
    return <div className="p-8">Redirecting to setup...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-8 font-sans">
      <Header title="Ledger Dashboard" />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
        <Card className="bg-blue-50 border-blue-100 font-sans">
          <CardHeader className="pb-2">
            <CardDescription className="text-blue-600 font-medium font-sans">Total Assets</CardDescription>
            <CardTitle className="text-2xl font-sans">{summary ? formatCurrency(summary.totalAssets) : "..."}</CardTitle>
          </CardHeader>
        </Card>
        <Card className={summary && summary.netIncome >= 0 ? "bg-green-50 border-green-100 font-sans" : "bg-red-50 border-red-100 font-sans"}>
          <CardHeader className="pb-2">
            <CardDescription className={summary && summary.netIncome >= 0 ? "text-green-600 font-medium font-sans" : "text-red-600 font-medium font-sans"}>Net Income</CardDescription>
            <CardTitle className="text-2xl font-sans">{summary ? formatCurrency(summary.netIncome) : "..."}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="md:col-span-2 lg:col-span-1 border-dashed font-sans">
          <CardHeader className="pb-2 font-sans">
            <CardDescription className="font-medium font-sans">Quick Stats</CardDescription>
            <CardTitle className="text-sm text-neutral-500 font-sans">Precise double-entry tracking</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
        <Card className="font-sans">
          <CardHeader>
            <CardTitle>Chart of Accounts</CardTitle>
            <CardDescription>Manage your assets, liabilities, equity, income, and expenses.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/accounts">
              <Button className="w-full">View Accounts</Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="font-sans">
          <CardHeader>
            <CardTitle>Journals</CardTitle>
            <CardDescription>Record double-entry transactions and view history.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/journals">
              <Button className="w-full">View Journals</Button>
            </Link>
          </CardContent>
        </Card>
        <Card className="font-sans">
          <CardHeader>
            <CardTitle>Reports</CardTitle>
            <CardDescription>View Trial Balance, and Income Statements.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/reports">
              <Button className="w-full">View Reports</Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      <div className="mt-12 pt-8 border-t border-red-100">
        <h2 className="text-xl font-semibold text-red-600 mb-4">Danger Zone</h2>
        <Card className="border-red-200 bg-red-50/50 font-sans">
          <CardHeader>
            <CardTitle className="text-red-700">Administrative Actions</CardTitle>
            <CardDescription className="text-red-600">
              Clear data or import history from a `journals.csv` file.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {importProgress.isImporting && (
              <div className="w-full bg-white p-4 rounded-lg border border-red-200 mb-4 animate-in fade-in slide-in-from-top-4 font-sans">
                <div className="flex justify-between text-sm font-medium text-red-700 mb-2">
                  <span>{importProgress.status}</span>
                  <span>{Math.round((importProgress.current / importProgress.total) * 100)}%</span>
                </div>
                <div className="w-full bg-red-100 rounded-full h-2.5">
                  <div 
                    className="bg-red-600 h-2.5 rounded-full transition-all duration-300" 
                    style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                  ></div>
                </div>
                <p className="text-xs text-red-500 mt-2 font-sans">
                  Processing item {importProgress.current} of {importProgress.total}
                </p>
              </div>
            )}

            <div className="flex flex-wrap gap-4">
              <Button 
                variant="destructive" 
                disabled={importProgress.isImporting}
                onClick={() => setConfirmClearOpen(true)}
              >
                Clear All Data
              </Button>

              <div className="relative">
                <input
                  type="file"
                  id="csv-upload"
                  className="hidden"
                  accept=".csv"
                  disabled={importProgress.isImporting}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;

                    const reader = new FileReader();
                    reader.onload = async (evt) => {
                      const csvContent = evt.target?.result as string;
                      try {
                        const records = parseCSV(csvContent);
                        if (records.length === 0) {
                          toast.error("No records found in CSV.");
                          return;
                        }

                        setImportProgress({
                          total: records.length,
                          current: 0,
                          status: "Identifying accounts...",
                          isImporting: true
                        });

                        // 1. Ensure accounts exist
                        const accountNames = Array.from(new Set(records.flatMap(r => [r["From (Source)"], r["To (Destination)"]]).filter(Boolean)));
                        await fetch("/api/admin/ensure-accounts", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ accountNames })
                        });

                        // 2. Import each entry
                        for (let i = 0; i < records.length; i++) {
                          const record = records[i];
                          setImportProgress(prev => ({
                            ...prev,
                            current: i + 1,
                            status: `Importing: ${record["Description"] || "Journal Entry"}...`
                          }));

                          const res = await fetch("/api/admin/import-entry", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              date: record["Date"],
                              description: record["Description"],
                              amount: record["Amount"],
                              from: record["From (Source)"],
                              to: record["To (Destination)"],
                              notes: record["Notes"]
                            })
                          });

                          if (!res.ok) {
                            const err = await res.json();
                            throw new Error(err.error || "Failed to import entry");
                          }
                        }

                        toast.success("Import complete!");
                        setImportProgress(prev => ({ ...prev, status: "Import complete! Refreshing..." }));
                        setTimeout(() => window.location.reload(), 1500);

                      } catch (err: any) {
                        toast.error(`Import error: ${err.message}`);
                        setImportProgress({ total: 0, current: 0, status: "", isImporting: false });
                      }
                    };
                    reader.readAsText(file);
                  }}
                />
                <Button 
                  variant="outline" 
                  className="border-red-300 text-red-700 hover:bg-red-100"
                  disabled={importProgress.isImporting}
                  onClick={() => document.getElementById("csv-upload")?.click()}
                >
                  Import Journals from CSV
                </Button>
              </div>

              <a href="/sample-journals.csv" download>
                <Button variant="ghost" className="text-neutral-600 hover:bg-neutral-100">
                  Download Sample CSV
                </Button>
              </a>
            </div>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={confirmClearOpen} onOpenChange={setConfirmClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you ABSOLUTELY sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently clear all ledger data, including all accounts and journal entries.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              variant="destructive" 
              onClick={() => {
                handleClearData();
                setConfirmClearOpen(false);
              }}
            >
              Clear All Data
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
