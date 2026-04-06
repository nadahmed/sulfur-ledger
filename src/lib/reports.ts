import { getAccountLines } from "@/lib/db/journals";
import { getAccounts } from "@/lib/db/accounts";
import { 
  subWeeks, subMonths, subYears, 
  startOfWeek, startOfMonth, startOfYear, 
  format, parseISO,
  addDays, addWeeks, addMonths, addYears
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

    const getDistribution = (category: string, maxItems: number = 5) => {
      const items = balances
        .filter(b => b.category === category && b.balance !== 0)
        .map(b => ({ name: b.name, value: Math.abs(b.balance) / 100 }))
        .sort((a, b) => b.value - a.value);

      if (items.length <= maxItems) {
        return items.map((item, i) => ({
          ...item,
          fill: `hsl(${(i * 137.5) % 360}, 65%, 50%)`
        }));
      }

      const topItems = items.slice(0, maxItems);
      const otherValue = items.slice(maxItems).reduce((sum, item) => sum + item.value, 0);
      
      const result = [
        ...topItems,
        { name: "Other", value: otherValue }
      ];

      return result.map((item, i) => ({
        ...item,
        fill: `hsl(${(i * 137.5) % 360}, 65%, 50%)`
      }));
    };

    const assetDistribution = getDistribution("asset");
    const expenseDistribution = getDistribution("expense");

    const incomeStats = [
      { name: "Income", amount: totalIncome / 100, fill: "hsl(142, 70%, 45%)" },
      { name: "Expenses", amount: totalExpenses / 100, fill: "hsl(0, 70%, 60%)" }
    ];

    return { 
      totalAssets, 
      netIncome, 
      totalIncome, 
      totalExpenses, 
      cashBalance,
      assetDistribution,
      expenseDistribution,
      incomeStats
    };
  }

  if (reportType === "trend" && searchParams) {
    const period = (searchParams.get("period") || "months") as "days" | "weeks" | "months" | "years";
    
    // Use provided dates or default to past 6 months if missing
    let start = startDate;
    let end = endDate || format(new Date(), "yyyy-MM-dd");

    if (!start) {
      const now = new Date();
      if (period === "days") start = format(addDays(now, -30), "yyyy-MM-dd");
      else if (period === "weeks") start = format(subWeeks(now, 12), "yyyy-MM-dd");
      else if (period === "years") start = format(subYears(now, 5), "yyyy-MM-dd");
      else start = format(subMonths(now, 6), "yyyy-MM-dd");
    }

    let parsedStart = parseISO(start);
    const parsedEnd = parseISO(end);
    
    // Limit "days" grouping to at most 90 days from the end of the range
    if (period === "days") {
       const ninetyDaysAgo = addDays(parsedEnd, -90);
       if (parsedStart < ninetyDaysAgo) {
         parsedStart = ninetyDaysAgo;
         start = format(parsedStart, "yyyy-MM-dd"); // Update query start date
       }
    }

    const incomeAccounts = accounts.filter(a => a.category === "income");
    const expenseAccounts = accounts.filter(a => a.category === "expense");
    const incomeIds = new Set(incomeAccounts.map(a => a.id));

    const trends: Record<string, { income: number; expense: number; label: string; date: Date }> = {};
    
    // Generate buckets
    let currentBucketDate = period === "days" ? parsedStart :
                         period === "weeks" ? startOfWeek(parsedStart) :
                         period === "years" ? startOfYear(parsedStart) :
                         startOfMonth(parsedStart);

    let bucketLimit = 0;
    while (currentBucketDate <= parsedEnd && bucketLimit < 1000) {
      let key: string;
      let label: string;
      
      if (period === "days") {
        key = format(currentBucketDate, "yyyy-MM-dd");
        label = format(currentBucketDate, "MMM d");
      } else if (period === "weeks") {
        key = format(currentBucketDate, "yyyy-MM-dd");
        label = `Wk ${format(currentBucketDate, "MMM d")}`;
      } else if (period === "years") {
        key = format(currentBucketDate, "yyyy");
        label = format(currentBucketDate, "yyyy");
      } else {
        key = format(currentBucketDate, "yyyy-MM");
        label = format(currentBucketDate, "MMM yyyy");
      }
      
      trends[key] = { income: 0, expense: 0, label, date: currentBucketDate };

      if (period === "days") currentBucketDate = addDays(currentBucketDate, 1);
      else if (period === "weeks") currentBucketDate = addWeeks(currentBucketDate, 1);
      else if (period === "years") currentBucketDate = addYears(currentBucketDate, 1);
      else currentBucketDate = addMonths(currentBucketDate, 1);
      bucketLimit++;
    }

    await Promise.all([...incomeAccounts, ...expenseAccounts].map(async (acc) => {
      let lines = await getAccountLines(orgId, acc.id, start, end);
      
      if (filterTags && filterTags.length > 0) {
        lines = lines.filter(line => 
          line.tags && filterTags.some(t => line.tags!.includes(t))
        );
      }
      
      lines.forEach(line => {
        const lineDate = parseISO(line.date);
        let key: string;
        if (period === "days") {
           key = format(lineDate, "yyyy-MM-dd");
        } else if (period === "weeks") {
           key = format(startOfWeek(lineDate), "yyyy-MM-dd");
        } else if (period === "years") {
           key = format(lineDate, "yyyy");
        } else {
           key = format(lineDate, "yyyy-MM");
        }

        if (trends[key]) {
          if (incomeIds.has(acc.id)) {
            trends[key].income -= line.amount / 100;
          } else {
            trends[key].expense += line.amount / 100;
          }
        }
      });
    }));

    return Object.values(trends).sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  throw new Error("Invalid report type");
}
