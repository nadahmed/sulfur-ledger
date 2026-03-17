import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { randomUUID } from "crypto";
import { getAccounts, createAccount, AccountCategory } from "@/lib/db/accounts";

function inferCategory(name: string): AccountCategory {
  const lowerName = name.toLowerCase();
  if (
    ["cash wallet", "city bank", "prime bank", "bkash"].includes(lowerName) ||
    lowerName.includes("recievable") ||
    lowerName.includes("starting cash")
  ) {
    return "asset";
  }
  if (lowerName.includes("payable")) {
    return "liability";
  }
  if (
    lowerName.includes("starting balance") ||
    lowerName.includes("drawings") ||
    lowerName.includes("equity")
  ) {
    return "equity";
  }
  if (lowerName.includes("income") || lowerName.includes("revenue")) {
    return "income";
  }
  return "expense";
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
    const { accountNames } = await req.json();
    if (!Array.isArray(accountNames)) {
      return NextResponse.json({ error: "accountNames must be an array" }, { status: 400 });
    }

    const existingAccounts = await getAccounts(orgId);
    const existingNames = new Set(existingAccounts.map(a => a.name));
    
    let createdCount = 0;
    for (const name of accountNames) {
      if (!existingNames.has(name)) {
        await createAccount({
          orgId,
          id: randomUUID(),
          name,
          category: inferCategory(name),
          status: "active",
          createdAt: new Date().toISOString(),
        });
        createdCount++;
      }
    }

    return NextResponse.json({ message: `Ensured ${accountNames.length} accounts. Created ${createdCount} new ones.` });
  } catch (err: any) {
    console.error("Ensure accounts error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
