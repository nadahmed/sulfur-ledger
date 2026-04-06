import { NextRequest, NextResponse } from "next/server";
import { checkPermission } from "@/lib/auth";
import { createRecurringEntry, getRecurringEntries, getRecurringEntriesByAccount, updateRecurringEntry, deleteRecurringEntry } from "@/lib/db/recurring";
import { uuidv7 } from "uuidv7";

export async function GET(req: NextRequest) {
  const auth = await checkPermission("read:journals", req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const orgId = req.cookies.get("activeOrgId")?.value || req.headers.get("x-org-id");
  if (!orgId) return NextResponse.json({ error: "No active organization" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const accountId = searchParams.get("accountId");

  try {
    if (accountId) {
      const entries = await getRecurringEntriesByAccount(orgId, accountId);
      return NextResponse.json(entries);
    }
    const entries = await getRecurringEntries(orgId);
    return NextResponse.json(entries);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await checkPermission("create:journals", req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { user } = auth;

  const orgId = req.cookies.get("activeOrgId")?.value;
  if (!orgId) return NextResponse.json({ error: "No active organization" }, { status: 400 });

  try {
    const body = await req.json();
    const id = uuidv7();
    const amountFloat = parseFloat(body.amount);
    const amount = Math.round(amountFloat * 100);
    
    const entry = await createRecurringEntry({
      ...body,
      orgId,
      id,
      amount,
      createdAt: new Date().toISOString(),
      nextProcessDate: body.startDate,
      isActive: true,
    }, user!.sub, user!.name);

    return NextResponse.json(entry, { status: 201 });
  } catch (err: any) {
    console.error("POST /api/recurring error:", err);
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
    const { id, ...updates } = body;
    
    if (updates.amount !== undefined) {
      updates.amount = Math.round(parseFloat(updates.amount) * 100);
    }

    await updateRecurringEntry(orgId, id, updates, user!.sub, user!.name);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("PATCH /api/recurring error:", err);
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
    const accountId = searchParams.get("accountId");

    if (accountId) {
      // Cleanup all recurring entries for this account
      const entries = await getRecurringEntriesByAccount(orgId, accountId);
      for (const entry of entries) {
        await deleteRecurringEntry(orgId, entry.id, user!.sub, user!.name);
      }
      return NextResponse.json({ success: true, deletedCount: entries.length });
    }

    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    await deleteRecurringEntry(orgId, id, user!.sub, user!.name);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("DELETE /api/recurring error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
