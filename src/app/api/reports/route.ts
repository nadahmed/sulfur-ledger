import { NextRequest, NextResponse } from "next/server";
import { getJournalEntries, getAccountLines } from "@/lib/db/journals";
import { getAccounts } from "@/lib/db/accounts";
import { checkPermission } from "@/lib/auth";
import { 
  subWeeks, subMonths, subYears, 
  startOfWeek, startOfMonth, startOfYear, 
  format, parseISO,
  addWeeks, addMonths, addYears
} from "date-fns";


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

    const accounts = await getAccounts(orgId);
    
    // Fast memory ledger since this is simple ledger app
    let priorRetainedEarnings = 0;
    let lifeToDateRetainedEarnings = 0;

    const balancesList = await Promise.all(accounts.map(async (acc: any) => {
      const isPermanent = ["asset", "liability", "equity"].includes(acc.category);
      
      const queryStart = "1970-01-01";
      const queryEnd = endDate || "2100-12-31";
      
      const lines = await getAccountLines(orgId, acc.id, queryStart, queryEnd);
      
      let priorBalance = 0;
      let periodBalance = 0;

      lines.forEach((line: any) => {
        const lineDate = line.date.split("T")[0]; 
        const startD = startDate ? startDate.split("T")[0] : null;

        if (startD && lineDate < startD) {
          priorBalance += (line.amount || 0);
        } else {
          periodBalance += (line.amount || 0);
        }
      });

      const lifeToDateBalance = priorBalance + periodBalance;
      
      if (!isPermanent) {
        priorRetainedEarnings += priorBalance;
        lifeToDateRetainedEarnings += lifeToDateBalance;
      }

      const balance = isPermanent ? lifeToDateBalance : periodBalance;
      return { ...acc, balance };
    }));

    const balances = [...balancesList];

    if (reportType === "trial-balance") {
      const tbBalances = [...balances];
      
      if (priorRetainedEarnings !== 0 && startDate) {
        tbBalances.push({
          id: "retained-earnings-prior",
          name: "Retained Earnings (Prior)",
          category: "equity",
          balance: priorRetainedEarnings
        });
      }

      const categoryOrder = ["asset", "liability", "equity", "income", "expense"];
      const sortedBalances = tbBalances
        .filter(b => b.balance !== 0)
        .sort((a, b) => {
          const orderA = categoryOrder.indexOf(a.category);
          const orderB = categoryOrder.indexOf(b.category);
          if (orderA !== orderB) return orderA - orderB;
          return a.name.localeCompare(b.name);
        });

      const totalDebits = tbBalances.filter(b => b.balance > 0).reduce((sum, b) => sum + b.balance, 0);
      const totalCredits = tbBalances.filter(b => b.balance < 0).reduce((sum, b) => sum + Math.abs(b.balance), 0);
      return NextResponse.json({ accounts: sortedBalances, totalDebits, totalCredits });
    }

    if (reportType === "balance-sheet") {
      const bsBalances = [...balances];
      if (lifeToDateRetainedEarnings !== 0) {
        bsBalances.push({
          id: "retained-earnings-ltd",
          name: "Retained Earnings",
          category: "equity",
          balance: lifeToDateRetainedEarnings
        });
      }

      const assets = bsBalances.filter(b => b.category === "asset" && b.balance !== 0);
      const liabilities = bsBalances.filter(b => b.category === "liability" && b.balance !== 0);
      const equity = bsBalances.filter(b => b.category === "equity" && b.balance !== 0);
      return NextResponse.json({ assets, liabilities, equity });
    }

    if (reportType === "income-statement") {
      const income = balances.filter(b => b.category === "income" && b.balance !== 0);
      const expenses = balances.filter(b => b.category === "expense" && b.balance !== 0);
      return NextResponse.json({ income, expenses });
    }

    if (reportType === "summary") {
      const totalAssets = balances.filter(b => b.category === "asset").reduce((sum, b) => sum + b.balance, 0);
      const totalIncome = balances.filter(b => b.category === "income").reduce((sum, b) => sum - b.balance, 0);
      const totalExpenses = balances.filter(b => b.category === "expense").reduce((sum, b) => sum + b.balance, 0);
      const netIncome = totalIncome - totalExpenses;
      return NextResponse.json({ totalAssets, netIncome });
    }

    if (reportType === "dashboard") {
      const totalAssets = balances.filter(b => b.category === "asset").reduce((sum, b) => sum + b.balance, 0);
      const totalIncome = balances.filter(b => b.category === "income").reduce((sum, b) => sum - b.balance, 0);
      const totalExpenses = balances.filter(b => b.category === "expense").reduce((sum, b) => sum + b.balance, 0);
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

    if (reportType === "trend") {
      const period = (searchParams.get("period") || "months") as "weeks" | "months" | "years";
      const count = parseInt(searchParams.get("count") || "6");
      
      const now = new Date();
      let startDate: Date;
      
      if (period === "weeks") {
        startDate = startOfWeek(subWeeks(now, count - 1));
      } else if (period === "years") {
        startDate = startOfYear(subYears(now, count - 1));
      } else {
        startDate = startOfMonth(subMonths(now, count - 1));
      }

      const formattedStart = format(startDate, "yyyy-MM-dd");
      const formattedEnd = format(now, "yyyy-MM-dd");

      const incomeAccounts = accounts.filter(a => a.category === "income");
      const expenseAccounts = accounts.filter(a => a.category === "expense");
      const incomeIds = new Set(incomeAccounts.map(a => a.id));

      const trends: Record<string, { income: number; expense: number; label: string; date: Date }> = {};
      
      for (let i = 0; i < count; i++) {
        let bucketDate: Date;
        let label: string;
        let key: string;

        if (period === "weeks") {
          bucketDate = addWeeks(startDate, i);
          label = `Wk ${format(bucketDate, "MMM d")}`;
          key = format(bucketDate, "yyyy-MM-dd");
        } else if (period === "years") {
          bucketDate = addYears(startDate, i);
          label = format(bucketDate, "yyyy");
          key = format(bucketDate, "yyyy");
        } else {
          bucketDate = addMonths(startDate, i);
          label = format(bucketDate, "MMM yyyy");
          key = format(bucketDate, "yyyy-MM");
        }
        
        trends[key] = { income: 0, expense: 0, label, date: bucketDate };
      }

      await Promise.all([...incomeAccounts, ...expenseAccounts].map(async (acc) => {
        const lines = await getAccountLines(orgId, acc.id, formattedStart, formattedEnd);
        lines.forEach(line => {
          const lineDate = parseISO(line.date);
          let key: string;
          if (period === "weeks") {
             key = format(startOfWeek(lineDate), "yyyy-MM-dd");
          } else if (period === "years") {
             key = format(lineDate, "yyyy");
          } else {
             key = format(lineDate, "yyyy-MM");
          }

          if (trends[key]) {
            if (incomeIds.has(acc.id)) {
              // Income is normally credit (negative), so subtract to make positive
              trends[key].income -= line.amount / 100;
            } else {
              // Expense is normally debit (positive)
              trends[key].expense += line.amount / 100;
            }
          }
        });
      }));

      const trendData = Object.values(trends).sort((a, b) => a.date.getTime() - b.date.getTime());
      return NextResponse.json(trendData);
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
