import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { getAccounts } from "@/lib/db/accounts";
import * as LedgerService from "@/lib/ledger";
import { normalizeDate, normalizeAmount } from "@/lib/utils";

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
    const { date, description, amount: amountStr, from, to } = await req.json();

    if (!date || !amountStr || !from || !to) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const allAccounts = await getAccounts(orgId);
    const fromAccount = allAccounts.find((a) => a.name === from);
    const toAccount   = allAccounts.find((a) => a.name === to);

    if (!fromAccount || !toAccount) {
      return NextResponse.json(
        { error: `Account not found: ${!fromAccount ? from : to}` },
        { status: 400 }
      );
    }

    const ctx: LedgerService.UserContext = { userId: session.user.sub! };

    const result = await LedgerService.recordImportEntry(orgId, {
      date: normalizeDate(date),
      description: description || "Imported Entry",
      toAccountId: toAccount.id,
      fromAccountId: fromAccount.id,
      amountPaisa: normalizeAmount(String(amountStr).replace(/[৳,]/g, "").trim()),
    }, ctx);

    return NextResponse.json({ success: true, journalId: result });
  } catch (err: any) {
    console.error("Import entry error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
