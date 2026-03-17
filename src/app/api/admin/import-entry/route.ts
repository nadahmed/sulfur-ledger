import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { randomUUID } from "crypto";
import { getAccounts } from "@/lib/db/accounts";
import { createJournalEntry, JournalEntry, JournalLine } from "@/lib/db/journals";

function parseAmount(amtStr: string): number {
  if (!amtStr) return 0;
  const cleaned = String(amtStr).replace(/[৳,]/g, "").trim();
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : Math.round(parsed * 100);
}

function parseDateStr(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date format: ${dateStr}`);
  }
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(d);
}

export async function POST(req: NextRequest) {
  const session = await auth0.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgId = req.cookies.get("activeOrgId")?.value;
  if (!orgId) {
    return NextResponse.json({ error: "No active organization" }, { status: 400 });
  }

  try {
    const { date, description, amount: amountStr, from, to, notes } = await req.json();

    if (!date || !amountStr || !from || !to) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const accounts = await getAccounts(orgId);
    const fromAccount = accounts.find(a => a.name === from);
    const toAccount = accounts.find(a => a.name === to);

    if (!fromAccount || !toAccount) {
      return NextResponse.json({ error: `Account not found: ${!fromAccount ? from : to}` }, { status: 400 });
    }

    const amount = parseAmount(amountStr);
    const entryDate = parseDateStr(date);
    const journalId = randomUUID();

    const entry: JournalEntry = {
      orgId,
      id: journalId,
      date: entryDate,
      description: description || "Imported Entry",
      notes: notes || undefined,
      createdAt: new Date().toISOString(),
    };

    const lines: JournalLine[] = [
      { orgId, journalId, accountId: toAccount.id, amount, date: entryDate },
      { orgId, journalId, accountId: fromAccount.id, amount: -amount, date: entryDate }
    ];

    await createJournalEntry(entry, lines);

    return NextResponse.json({ success: true, journalId });
  } catch (err: any) {
    console.error("Import entry error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
