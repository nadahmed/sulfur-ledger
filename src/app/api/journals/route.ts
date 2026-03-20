import { NextRequest, NextResponse } from "next/server";
import { 
  createJournalEntry, 
  getJournalEntriesWithLines, 
  updateJournalEntry, 
  deleteJournalEntry 
} from "@/lib/db/journals";
import { auth0 } from "@/lib/auth0";

import { checkPermission } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await checkPermission("read:journals", req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const orgId = req.cookies.get("activeOrgId")?.value;
  if (!orgId) {
    return NextResponse.json({ error: "No active organization" }, { status: 400 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const cursor = searchParams.get("cursor") || undefined;
    const date = searchParams.get("date") || undefined;

    const result = await getJournalEntriesWithLines(orgId, limit, cursor, date);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await checkPermission("create:journals", req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { user } = auth;

  const orgId = req.cookies.get("activeOrgId")?.value;
  if (!orgId) {
    return NextResponse.json({ error: "No active organization" }, { status: 400 });
  }

  try {
    const body = await req.json();
    const { date, description, amount, fromAccountId, toAccountId, notes, tags } = body;

    if (!date || !description || !amount || !fromAccountId || !toAccountId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const journalId = crypto.randomUUID();
    const parsedAmount = Math.round(parseFloat(amount) * 100);

    // If date is YYYY-MM-DD, append current time for sequencing
    let finalDate = date;
    if (date.length === 10) {
      finalDate = `${date}T${new Date().toISOString().slice(11)}`;
    }

    const parsedLines = [
      { orgId, journalId, accountId: toAccountId, amount: parsedAmount, date: finalDate },
      { orgId, journalId, accountId: fromAccountId, amount: -parsedAmount, date: finalDate }
    ];

    const result = await createJournalEntry({
      orgId, id: journalId, date: finalDate, description, notes, tags, createdAt: new Date().toISOString()
    }, parsedLines, user!.sub);

    return NextResponse.json(result, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await checkPermission("update:journals", req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { user } = auth;

  const orgId = req.cookies.get("activeOrgId")?.value;
  if (!orgId) return NextResponse.json({ error: "No active organization" }, { status: 400 });

  try {
    const body = await req.json();
    const { id, oldDate, date, description, amount, fromAccountId, toAccountId, notes, tags } = body;

    if (!id || !oldDate || !date || !description || !amount || !fromAccountId || !toAccountId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const parsedAmount = Math.round(parseFloat(amount) * 100);

    // If new date is YYYY-MM-DD, append current time for sequencing
    let finalDate = date;
    if (date.length === 10) {
      finalDate = `${date}T${new Date().toISOString().slice(11)}`;
    }

    const parsedLines = [
      { orgId, journalId: id, accountId: toAccountId, amount: parsedAmount, date: finalDate },
      { orgId, journalId: id, accountId: fromAccountId, amount: -parsedAmount, date: finalDate }
    ];

    await updateJournalEntry(orgId, id, oldDate, { date: finalDate, description, notes, tags }, parsedLines, user!.sub);
    return NextResponse.json({ message: "Journal updated" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await checkPermission("delete:journals", req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { user } = auth;

  const orgId = req.cookies.get("activeOrgId")?.value;
  if (!orgId) return NextResponse.json({ error: "No active organization" }, { status: 400 });

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const date = searchParams.get("date");

    if (!id || !date) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    await deleteJournalEntry(orgId, id, date, user!.sub);
    return NextResponse.json({ message: "Journal deleted" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
