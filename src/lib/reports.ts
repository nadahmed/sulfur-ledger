import { getAccountLines } from "@/lib/db/journals";
import { getAccounts } from "@/lib/db/accounts";
import { 
  subWeeks, subMonths, subYears, 
  startOfWeek, startOfMonth, startOfYear, 
  format, parseISO,
  addWeeks, addMonths, addYears
} from "date-fns";

export async function generateReportData(
  orgId: string, 
  reportType: string, 
  startDate?: string, 
  endDate?: string,
  searchParams?: URLSearchParams,
  filterTags?: string[] // Tag IDs to filter by
) {
  const accounts = await getAccounts(orgId);
  
  // Fast memory ledger since this is simple ledger app
  let priorRetainedEarnings = 0;
  let lifeToDateRetainedEarnings = 0;

  const balancesList = await Promise.all(accounts.map(async (acc: any) => {
    const isPermanent = ["asset", "liability", "equity"].includes(acc.category);
    
    const queryStart = "1970-01-01";
    const queryEnd = endDate || "2100-12-31";
    
    let lines = await getAccountLines(orgId, acc.id, queryStart, queryEnd);
    
    // Filter lines by tags if provided
    if (filterTags && filterTags.length > 0) {
      lines = lines.filter(line => 
        line.tags && filterTags.some(t => line.tags!.includes(t))
      );
    }
    
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
    return { accounts: sortedBalances, totalDebits, totalCredits };
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
    return { assets, liabilities, equity };
  }

  if (reportType === "income-statement") {
    const income = balances.filter(b => b.category === "income" && b.balance !== 0);
    const expenses = balances.filter(b => b.category === "expense" && b.balance !== 0);
    return { income, expenses };
  }

  if (reportType === "summary") {
    const totalAssets = balances.filter(b => b.category === "asset").reduce((sum, b) => sum + b.balance, 0);
    const totalIncome = balances.filter(b => b.category === "income").reduce((sum, b) => sum - b.balance, 0);
    const totalExpenses = balances.filter(b => b.category === "expense").reduce((sum, b) => sum + b.balance, 0);
    const netIncome = totalIncome - totalExpenses;
    return { totalAssets, netIncome };
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

    return { 
      totalAssets, 
      netIncome, 
      totalIncome, 
      totalExpenses, 
      cashBalance,
      assetDistribution,
      incomeStats
    };
  }

  if (reportType === "trend" && searchParams) {
    const period = (searchParams.get("period") || "months") as "weeks" | "months" | "years";
    const count = parseInt(searchParams.get("count") || "6");
    
    const now = new Date();
    let startDateTrend: Date;
    
    if (period === "weeks") {
      startDateTrend = startOfWeek(subWeeks(now, count - 1));
    } else if (period === "years") {
      startDateTrend = startOfYear(subYears(now, count - 1));
    } else {
      startDateTrend = startOfMonth(subMonths(now, count - 1));
    }

    const formattedStart = format(startDateTrend, "yyyy-MM-dd");
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
        bucketDate = addWeeks(startDateTrend, i);
        label = `Wk ${format(bucketDate, "MMM d")}`;
        key = format(bucketDate, "yyyy-MM-dd");
      } else if (period === "years") {
        bucketDate = addYears(startDateTrend, i);
        label = format(bucketDate, "yyyy");
        key = format(bucketDate, "yyyy");
      } else {
        bucketDate = addMonths(startDateTrend, i);
        label = format(bucketDate, "MMM yyyy");
        key = format(bucketDate, "yyyy-MM");
      }
      
      trends[key] = { income: 0, expense: 0, label, date: bucketDate };
    }

    await Promise.all([...incomeAccounts, ...expenseAccounts].map(async (acc) => {
      let lines = await getAccountLines(orgId, acc.id, formattedStart, formattedEnd);
      
      // Filter lines by tags if provided
      if (filterTags && filterTags.length > 0) {
        lines = lines.filter(line => 
          line.tags && filterTags.some(t => line.tags!.includes(t))
        );
      }
      
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

    return Object.values(trends).sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  throw new Error("Invalid report type");
}
