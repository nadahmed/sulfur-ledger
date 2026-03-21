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
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "10");
    const search = searchParams.get("search")?.toLowerCase() || "";
    const category = searchParams.get("category") || "";

    let accounts = await getAccounts(orgId);
    
    // Filter by archived status
    if (!includeArchived) {
      accounts = accounts.filter(a => a.status !== "archived");
    }

    // Filter by search term
    if (search) {
      accounts = accounts.filter(a => a.name.toLowerCase().includes(search));
    }

    // Filter by category
    if (category && category !== "all") {
      accounts = accounts.filter(a => a.category === category);
    }

    // Sort by category
    const categoryOrder = ["asset", "liability", "equity", "income", "expense"];
    accounts.sort((a, b) => {
      const orderA = categoryOrder.indexOf(a.category);
      const orderB = categoryOrder.indexOf(b.category);
      if (orderA !== orderB) return orderA - orderB;
      return a.name.localeCompare(b.name);
    });

    // Pagination
    const total = accounts.length;
    const totalPages = Math.ceil(total / pageSize);
    const startIndex = (page - 1) * pageSize;
    const paginatedAccounts = accounts.slice(startIndex, startIndex + pageSize);

    return NextResponse.json({
      data: paginatedAccounts,
      meta: {
        total,
        page,
        pageSize,
        totalPages
      }
    });
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
    }, user!.sub, user!.name);

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
      await archiveAccount(orgId, accountId, user!.sub, user!.name);
      return NextResponse.json({ message: "Account archived successfully because it contains transactions." });
    } else {
      // Hard delete
      await deleteAccount(orgId, accountId, user!.sub, user!.name);
      return NextResponse.json({ message: "Account deleted permanently." });
    }

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const { user, isOwner, error, status } = await checkPermission("manage:accounts", req);
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
      await unarchiveAccount(orgId, accountId, user!.sub, user!.name);
      return NextResponse.json({ message: "Account unarchived successfully." });
    }

    const { name } = await req.json();
    if (name) {
      const { updateAccountName, getAccounts } = require("@/lib/db/accounts");
      
      // Check for duplicate names
      const existingAccounts = await getAccounts(orgId);
      if (existingAccounts.some((a: any) => a.id !== accountId && a.name.toLowerCase() === name.toLowerCase())) {
        return NextResponse.json({ error: "An account with this name already exists" }, { status: 400 });
      }

      await updateAccountName(orgId, accountId, name, user!.sub, user!.name);
      return NextResponse.json({ message: "Account name updated successfully." });
    }

    return NextResponse.json({ error: "Invalid action or missing name" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
