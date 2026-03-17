import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { getJournalEntries, getAccountLines } from "@/lib/db/journals";
import { getAccounts } from "@/lib/db/accounts";

import { checkPermission } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const { user, isOwner, error, status } = await checkPermission("read:reports", req);
  if (error) return NextResponse.json({ error }, { status });

  const orgId = req.cookies.get("activeOrgId")?.value;
  if (!orgId) {
    return NextResponse.json({ error: "No active organization" }, { status: 400 });
  }

  try {
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
    // In production, you'd calculate these incrementally using aggregations or ElasticSearch.
    const balances = await Promise.all(accounts.map(async (acc: any) => {
      const lines = await getAccountLines(orgId, acc.id, startDate, endDate);
      const balance = lines.reduce((sum: number, line: any) => sum + line.amount, 0);
      return { ...acc, balance };
    }));

    if (reportType === "trial-balance") {
      const totalDebits = balances.filter(b => b.balance > 0).reduce((sum, b) => sum + b.balance, 0);
      const totalCredits = balances.filter(b => b.balance < 0).reduce((sum, b) => sum + Math.abs(b.balance), 0);
      return NextResponse.json({ accounts: balances.filter(b => b.balance !== 0), totalDebits, totalCredits });
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

    return NextResponse.json({ error: "Invalid report type" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
