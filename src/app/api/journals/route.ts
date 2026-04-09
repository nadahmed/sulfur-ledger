import { NextRequest, NextResponse } from "next/server";
import { uuidv7 } from "uuidv7";
import {
  createJournalEntry,
  getJournalEntriesWithLines,
  updateJournalEntry,
  deleteJournalEntry,
  getJournalEntry
} from "@/lib/db/journals";
import { getOrganization } from "@/lib/db/organizations";
import { getEffectiveStorageConfig, finalizeFile, deleteFile } from "@/lib/storage";

import { checkPermission } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await checkPermission("read:journals", req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const orgId = req.cookies.get("activeOrgId")?.value || req.headers.get("x-org-id");
  if (!orgId) {
    return NextResponse.json({ error: "No active organization" }, { status: 400 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const cursor = searchParams.get("cursor") || undefined;
    const date = searchParams.get("date") || undefined;
    const search = searchParams.get("search") || undefined;

    // Resolve account name matches so the DB layer can also search by from/to account
    let matchingAccountIds: string[] = [];
    if (search) {
      const { getAccounts } = require("@/lib/db/accounts");
      const accounts = await getAccounts(orgId);
      matchingAccountIds = accounts
        .filter((a: any) => a.name.toLowerCase().includes(search.toLowerCase()))
        .map((a: any) => a.id);
    }

    const result = await getJournalEntriesWithLines(orgId, limit, cursor, date, search, matchingAccountIds);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("GET Journals Error:", err);
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
    const { date, description, amount, fromAccountId, toAccountId, tags, receipt } = body;

    if (!date || !description || !amount || !fromAccountId || !toAccountId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const journalId = uuidv7();
    const parsedAmount = Math.round(parseFloat(amount) * 100);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return NextResponse.json({ error: "Amount must be a positive number greater than zero." }, { status: 400 });
    }

    // date is stored as plain YYYY-MM-DD; uuidv7 provides time-ordering within a date
    const finalDate = date.slice(0, 10);

    const parsedLines = [
      { orgId, journalId, accountId: toAccountId, amount: parsedAmount, date: finalDate },
      { orgId, journalId, accountId: fromAccountId, amount: -parsedAmount, date: finalDate }
    ];

    const result = await createJournalEntry({
      orgId, id: journalId, date: finalDate, description, tags, receipt, createdAt: new Date().toISOString()
    }, parsedLines, user!.sub, user!.name);

    // --- Receipt Finalization ---
    if (receipt && receipt.key) {
      try {
        const org = await getOrganization(orgId);
        if (org) {
          const config = getEffectiveStorageConfig(org);
          const finalKey = await finalizeFile(config, receipt.key);

          // Update DB with final key if it changed
          if (finalKey !== receipt.key) {
            await updateJournalEntry(orgId, journalId, finalDate, { receipt: { ...receipt, key: finalKey } }, [], user!.sub, user!.name);
          }
        }
      } catch (err) {
        console.error("Receipt finalization failed:", err);
      }
    }

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
    const { id, oldDate, date, description, amount, fromAccountId, toAccountId, tags, receipt } = body;

    if (!id || !oldDate || !date || !description || !amount || !fromAccountId || !toAccountId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const parsedAmount = Math.round(parseFloat(amount) * 100);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return NextResponse.json({ error: "Amount must be a positive number greater than zero." }, { status: 400 });
    }

    // date is stored as plain YYYY-MM-DD; uuidv7 ID provides time-ordering
    const finalDate = date.slice(0, 10);

    const parsedLines = [
      { orgId, journalId: id, accountId: toAccountId, amount: parsedAmount, date: finalDate },
      { orgId, journalId: id, accountId: fromAccountId, amount: -parsedAmount, date: finalDate }
    ];

    // Fetch old entry to check for receipt changes
    const oldEntry = await getJournalEntry(orgId, id, oldDate);
    const oldReceipt = oldEntry?.receipt;

    await updateJournalEntry(orgId, id, oldDate, { date: finalDate, description, tags, receipt }, parsedLines, user!.sub, user!.name);

    // --- Receipt Side Effects ---
    const org = await getOrganization(orgId);
    if (org) {
      const config = getEffectiveStorageConfig(org);

      // 1. Delete old receipt if it was replaced or removed
      if (oldReceipt && oldReceipt.key && (!receipt || receipt.key !== oldReceipt.key)) {
        try {
          await deleteFile(config, oldReceipt.key);
        } catch (err) {
          console.error("Failed to delete old receipt:", err);
        }
      }

      // 2. Finalize new receipt if provided
      if (receipt && receipt.key && (!oldReceipt || receipt.key !== oldReceipt.key)) {
        try {
          const finalKey = await finalizeFile(config, receipt.key);
          if (finalKey !== receipt.key) {
            await updateJournalEntry(orgId, id, finalDate, { receipt: { ...receipt, key: finalKey } }, [], user!.sub, user!.name);
          }
        } catch (err) {
          console.error("Failed to finalize new receipt:", err);
        }
      }
    }

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

    const deletedEntry = await deleteJournalEntry(orgId, id, date, user!.sub, user!.name);

    // --- Receipt Cleanup ---
    if (deletedEntry?.receipt?.key) {
      try {
        const org = await getOrganization(orgId);
        if (org) {
          const config = getEffectiveStorageConfig(org);
          await deleteFile(config, deletedEntry.receipt.key);
        }
      } catch (err) {
        console.error("Failed to cleanup deleted journal receipt:", err);
      }
    }

    return NextResponse.json({ message: "Journal deleted" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
