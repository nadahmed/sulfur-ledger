import { NextRequest, NextResponse } from "next/server";
import * as LedgerService from "@/lib/ledger";
import { getOrganization } from "@/lib/db/organizations";
import { getEffectiveStorageConfig, finalizeFile, deleteFile } from "@/lib/storage";
import { checkPermission } from "@/lib/auth";
import { getAuditMetadata } from "@/lib/audit-utils";

// ─── GET /api/journals ───────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await checkPermission("read:journals", req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const orgId = req.cookies.get("activeOrgId")?.value || req.headers.get("x-org-id");
  if (!orgId) return NextResponse.json({ error: "No active organization" }, { status: 400 });

  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const cursor = searchParams.get("cursor") || undefined;
    const date = searchParams.get("date") || undefined;
    const search = searchParams.get("search") || undefined;

    let matchingAccountIds: string[] = [];
    if (search) {
      const allAccounts = await LedgerService.accounts.getAll(orgId);
      matchingAccountIds = allAccounts
        .filter((a) => a.name.toLowerCase().includes(search.toLowerCase()))
        .map((a) => a.id);
    }

    const result = await LedgerService.journals.getAll(orgId, {
      limit,
      cursor,
      date,
      search,
      matchingAccountIds,
    });
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("GET Journals Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ─── POST /api/journals ──────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await checkPermission("create:journals", req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { user } = auth;

  const orgId = req.cookies.get("activeOrgId")?.value;
  if (!orgId) return NextResponse.json({ error: "No active organization" }, { status: 400 });

  try {
    const metadata = getAuditMetadata(req);
    const body = await req.json();
    const { date, description, amount, fromAccountId, toAccountId, tags, receipt } = body;

    if (!date || !description || !amount || !fromAccountId || !toAccountId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const ctx: LedgerService.UserContext = {
      userId: user!.sub,
      userName: user!.name,
      ...metadata,
    };

    const result = await LedgerService.journals.record(orgId, {
      date,
      description,
      amount: parseFloat(amount),
      fromAccountId,
      toAccountId,
      tags,
      receipt,
    }, ctx);

    // ── Receipt Finalization ──────────────────────────────────────────────────
    if (receipt?.key) {
      try {
        const org = await getOrganization(orgId);
        if (org) {
          const config = getEffectiveStorageConfig(org);
          const finalKey = await finalizeFile(config, receipt.key);
          if (finalKey !== receipt.key) {
            await LedgerService.journals.update(orgId, result.id, result.date, {
              receipt: { ...receipt, key: finalKey },
            }, ctx);
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

// ─── PATCH /api/journals ─────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const auth = await checkPermission("update:journals", req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { user } = auth;

  const orgId = req.cookies.get("activeOrgId")?.value;
  if (!orgId) return NextResponse.json({ error: "No active organization" }, { status: 400 });

  try {
    const metadata = getAuditMetadata(req);
    const body = await req.json();
    const { id, oldDate, date, description, amount, fromAccountId, toAccountId, tags, receipt } = body;

    if (!id || !oldDate || !date || !description || !amount || !fromAccountId || !toAccountId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return NextResponse.json({ error: "Amount must be a positive number greater than zero." }, { status: 400 });
    }

    const ctx: LedgerService.UserContext = {
      userId: user!.sub,
      userName: user!.name,
      ...metadata,
    };

    // Fetch old receipt before overwriting
    const oldEntry = await LedgerService.journals.get(orgId, id, oldDate);
    const oldReceipt = oldEntry?.receipt;

    await LedgerService.journals.update(orgId, id, oldDate, {
      date,
      description,
      amount: parsedAmount,
      fromAccountId,
      toAccountId,
      tags,
      receipt,
    }, ctx);

    // ── Receipt Side Effects ──────────────────────────────────────────────────
    const org = await getOrganization(orgId);
    if (org) {
      const config = getEffectiveStorageConfig(org);

      if (oldReceipt?.key && (!receipt || receipt.key !== oldReceipt.key)) {
        try { await deleteFile(config, oldReceipt.key); }
        catch (err) { console.error("Failed to delete old receipt:", err); }
      }

      if (receipt?.key && (!oldReceipt || receipt.key !== oldReceipt.key)) {
        try {
          const finalKey = await finalizeFile(config, receipt.key);
          if (finalKey !== receipt.key) {
            await LedgerService.journals.update(orgId, id, date, { receipt: { ...receipt, key: finalKey } }, ctx);
          }
        } catch (err) { console.error("Failed to finalize new receipt:", err); }
      }
    }

    return NextResponse.json({ message: "Journal updated" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ─── DELETE /api/journals ────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const auth = await checkPermission("delete:journals", req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { user } = auth;

  const orgId = req.cookies.get("activeOrgId")?.value;
  if (!orgId) return NextResponse.json({ error: "No active organization" }, { status: 400 });

  try {
    const metadata = getAuditMetadata(req);
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const date = searchParams.get("date");

    if (!id || !date) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

    const ctx: LedgerService.UserContext = {
      userId: user!.sub,
      userName: user!.name,
      ...metadata,
    };

    const deletedEntry = await LedgerService.journals.delete(orgId, id, date, ctx);

    // ── Receipt Cleanup ───────────────────────────────────────────────────────
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
