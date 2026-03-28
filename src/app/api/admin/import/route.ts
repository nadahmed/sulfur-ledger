import { NextRequest, NextResponse } from "next/server";
import { checkPermission } from "@/lib/auth";
import { getAccounts, createAccount, Account } from "@/lib/db/accounts";
import { createJournalEntry, JournalEntry, JournalLine, getJournalEntries } from "@/lib/db/journals";

export async function POST(req: NextRequest) {
  try {
    const auth = await checkPermission("create:journals", req);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status || 403 });
    const { user } = auth;

    const orgId = req.cookies.get("activeOrgId")?.value || req.headers.get("x-org-id");
    if (!orgId) return NextResponse.json({ error: "No active organization" }, { status: 400 });

    const { accounts: importAccounts, journals: importJournals } = await req.json();

    if (!importAccounts || !importJournals) {
      return NextResponse.json({ error: "Invalid import data format" }, { status: 400 });
    }

    // 1. Import Accounts
    const existingAccounts = await getAccounts(orgId);
    const existingNames = new Set(existingAccounts.map(a => a.name.toLowerCase()));
    const existingIds = new Set(existingAccounts.map(a => a.id));

    let accountsImported = 0;
    for (const acc of importAccounts as Account[]) {
      if (!existingIds.has(acc.id) && !existingNames.has(acc.name.toLowerCase())) {
        await createAccount({ ...acc, orgId }, user!.sub, user!.name);
        accountsImported++;
      }
    }

    // 2. Import Journals
    // To be safe, we check if journals with the same ID already exist
    const existingJournals = await getJournalEntries(orgId);
    const existingJournalIds = new Set(existingJournals.map(j => j.id));

    let journalsImported = 0;
    for (const j of importJournals) {
      if (!existingJournalIds.has(j.id)) {
        const entry: JournalEntry = {
          orgId,
          id: j.id,
          date: j.date,
          description: j.description,
          tags: j.tags,
          createdAt: j.createdAt || new Date().toISOString(),
        };
        const lines: JournalLine[] = j.lines.map((l: any) => ({ ...l, orgId }));
        
        await createJournalEntry(entry, lines, user!.sub, user!.name);
        journalsImported++;
      }
    }

    return NextResponse.json({ 
      message: `Import complete. Added ${accountsImported} accounts and ${journalsImported} journal entries.`,
      accountsImported,
      journalsImported
    });
  } catch (err: any) {
    console.error("[Import API Error]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
