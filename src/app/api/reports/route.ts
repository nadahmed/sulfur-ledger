import { NextRequest, NextResponse } from "next/server";
import { getJournalEntries, getAccountLines } from "@/lib/db/journals";
import { getAccounts } from "@/lib/db/accounts";
import { checkPermission } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const { user, isOwner, error, status } = await checkPermission("read:reports", req);
    if (error) return NextResponse.json({ error }, { status: status || 403 });

    const orgId = req.cookies.get("activeOrgId")?.value || req.headers.get("x-org-id");
    if (!orgId) {
      return NextResponse.json({ error: "No active organization" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get("start") || undefined;
    const endDate = searchParams.get("end") || undefined;
    const reportType = searchParams.get("type") || "trial-balance";

    // Fetch accounts and entries to calculate balances
    const [accounts, entries] = await Promise.all([
      getAccounts(orgId),
      getJournalEntries(orgId, startDate, endDate),
    ]);
    
    // Fast memory ledger since this is simple ledger app
    const balances = await Promise.all(accounts.map(async (acc: any) => {
      // Permanent accounts (Balance Sheet) use cumulative balance (ignore startDate)
      // Temporary accounts (Income Statement) use period balance
      const isPermanent = ["asset", "liability", "equity"].includes(acc.category);
      const effectiveStartDate = isPermanent ? undefined : startDate;
      
      const lines = await getAccountLines(orgId, acc.id, effectiveStartDate, endDate);
      const balance = (lines || []).reduce((sum: number, line: any) => sum + (line.amount || 0), 0);
      return { ...acc, balance };
    }));

    if (reportType === "trial-balance") {
      const categoryOrder = ["asset", "liability", "equity", "income", "expense"];
      const sortedBalances = [...balances]
        .filter(b => b.balance !== 0)
        .sort((a, b) => {
          const orderA = categoryOrder.indexOf(a.category);
          const orderB = categoryOrder.indexOf(b.category);
          if (orderA !== orderB) return orderA - orderB;
          return a.name.localeCompare(b.name);
        });

      const totalDebits = balances.filter(b => b.balance > 0).reduce((sum, b) => sum + b.balance, 0);
      const totalCredits = balances.filter(b => b.balance < 0).reduce((sum, b) => sum + Math.abs(b.balance), 0);
      return NextResponse.json({ accounts: sortedBalances, totalDebits, totalCredits });
    }

    if (reportType === "balance-sheet") {
      const assets = balances.filter(b => b.category === "asset" && b.balance !== 0);
      const liabilities = balances.filter(b => b.category === "liability" && b.balance !== 0);
      const equity = balances.filter(b => b.category === "equity" && b.balance !== 0);
      return NextResponse.json({ assets, liabilities, equity });
    }

    if (reportType === "income-statement") {
      const income = balances.filter(b => b.category === "income" && b.balance !== 0);
      const expenses = balances.filter(b => b.category === "expense" && b.balance !== 0);
      return NextResponse.json({ income, expenses });
    }

    if (reportType === "summary") {
      const totalAssets = balances.filter(b => b.category === "asset").reduce((sum, b) => sum + Math.abs(b.balance), 0);
      const totalIncome = balances.filter(b => b.category === "income").reduce((sum, b) => sum + Math.abs(b.balance), 0);
      const totalExpenses = balances.filter(b => b.category === "expense").reduce((sum, b) => sum + Math.abs(b.balance), 0);
      const netIncome = totalIncome - totalExpenses;
      return NextResponse.json({ totalAssets, netIncome });
    }

    if (reportType === "dashboard") {
      const totalAssets = balances.filter(b => b.category === "asset").reduce((sum, b) => sum + Math.abs(b.balance), 0);
      const totalIncome = balances.filter(b => b.category === "income").reduce((sum, b) => sum + Math.abs(b.balance), 0);
      const totalExpenses = balances.filter(b => b.category === "expense").reduce((sum, b) => sum + Math.abs(b.balance), 0);
      const netIncome = totalIncome - totalExpenses;
      
      const cashAccounts = balances.filter(b => (b.category === "asset") && (b.name?.toLowerCase().includes("cash") || b.name?.toLowerCase().includes("bank")));
      const cashBalance = cashAccounts.reduce((sum, b) => sum + b.balance, 0);

      const assetDistribution = balances
        .filter(b => b.category === "asset" && b.balance !== 0)
        .map((b, i) => ({ 
          name: b.name, 
          value: Math.abs(b.balance) / 100,
          fill: `hsl(${(i * 45) % 360}, 70%, 50%)`
        }));

      const incomeStats = [
        { name: "Income", amount: totalIncome / 100, fill: "#22c55e" },
        { name: "Expenses", amount: totalExpenses / 100, fill: "#ef4444" }
      ];

      return NextResponse.json({ 
        totalAssets, 
        netIncome, 
        totalIncome, 
        totalExpenses, 
        cashBalance,
        assetDistribution,
        incomeStats
      });
    }

    return NextResponse.json({ error: "Invalid report type" }, { status: 400 });
  } catch (err: any) {
    console.error("[API Error]", err);
    return NextResponse.json({ 
      error: err.message || "Internal server error", 
      stack: err.stack,
      orgIdUsed: req.cookies.get("activeOrgId")?.value || req.headers.get("x-org-id")
    }, { status: 500 });
  }
}
