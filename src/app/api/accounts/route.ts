import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { createAccount, getAccounts, AccountCategory } from "@/lib/db/accounts";

import { checkPermission } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const { user, isOwner, error, status } = await checkPermission("read:accounts", req);
  if (error) return NextResponse.json({ error }, { status });

  const orgId = req.cookies.get("activeOrgId")?.value;
  if (!orgId) {
    return NextResponse.json({ error: "No active organization" }, { status: 400 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const includeArchived = searchParams.get("includeArchived") === "true";

    const accounts = await getAccounts(orgId);
    const result = includeArchived ? accounts : accounts.filter(a => a.status !== "archived");
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("GET Accounts Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { user, isOwner, error, status } = await checkPermission("manage:accounts", req);
  if (error) return NextResponse.json({ error }, { status });

  const orgId = req.cookies.get("activeOrgId")?.value;
  if (!orgId) {
    return NextResponse.json({ error: "No active organization" }, { status: 400 });
  }

  try {
    const body = await req.json();
    const { id: providedId, name, category } = body;

    if (!name || !category) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const existingAccounts = await getAccounts(orgId);
    if (existingAccounts.some(a => a.name.toLowerCase() === name.toLowerCase())) {
      return NextResponse.json({ error: "An account with this name already exists" }, { status: 400 });
    }

    const { randomUUID } = require("crypto");
    const accountId = providedId || randomUUID();

    const validCategories = ["asset", "liability", "equity", "income", "expense"];
    if (!validCategories.includes(category)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }

    const account = await createAccount({
      orgId,
      id: accountId,
      name,
      category: category as AccountCategory,
      status: "active",
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json(account, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { user, isOwner, error, status } = await checkPermission("manage:accounts", req);
  if (error) return NextResponse.json({ error }, { status });

  const orgId = req.cookies.get("activeOrgId")?.value;
  if (!orgId) {
    return NextResponse.json({ error: "No active organization" }, { status: 400 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get("id");
    
    if (!accountId) {
      return NextResponse.json({ error: "Missing account id" }, { status: 400 });
    }

    // Check if account has transactions
    const { getAccountLines } = require("@/lib/db/journals");
    const { deleteAccount, archiveAccount } = require("@/lib/db/accounts");
    
    const lines = await getAccountLines(orgId, accountId);
    
    if (lines && lines.length > 0) {
      // Soft delete: archive
      await archiveAccount(orgId, accountId);
      return NextResponse.json({ message: "Account archived successfully because it contains transactions." });
    } else {
      // Hard delete
      await deleteAccount(orgId, accountId);
      return NextResponse.json({ message: "Account deleted permanently." });
    }

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const { isOwner, error, status } = await checkPermission("manage:accounts", req);
  if (error) return NextResponse.json({ error }, { status });

  const orgId = req.cookies.get("activeOrgId")?.value;
  if (!orgId) {
    return NextResponse.json({ error: "No active organization" }, { status: 400 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get("id");
    const action = searchParams.get("action");

    if (!accountId) {
      return NextResponse.json({ error: "Missing account id" }, { status: 400 });
    }

    if (action === "unarchive") {
      const { unarchiveAccount } = require("@/lib/db/accounts");
      await unarchiveAccount(orgId, accountId);
      return NextResponse.json({ message: "Account unarchived successfully." });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
