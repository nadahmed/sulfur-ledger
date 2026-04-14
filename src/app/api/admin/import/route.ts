import { NextRequest, NextResponse } from "next/server";
import { checkPermission } from "@/lib/auth";
import { getAccounts, createAccount, Account } from "@/lib/db/accounts";
import { createJournalEntry, JournalEntry, JournalLine, getJournalEntries } from "@/lib/db/journals";
import { clearOrganizationData } from "@/lib/db/admin";
import { normalizeDate } from "@/lib/utils";

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

    // 1. Clear existing dataset (Restore behavior)
    await clearOrganizationData(orgId);

    // 2. Import Accounts
    const memoryAccountIds = new Set<string>();
    const memoryAccountNames = new Set<string>();

    let accountsImported = 0;
    for (const acc of importAccounts as Account[]) {
      if (!acc.id || !acc.name) continue;
      
      const accountData: Account = {
        orgId,
        id: acc.id,
        name: acc.name,
        category: acc.category,
        status: acc.status || "active",
        createdAt: acc.createdAt || new Date().toISOString(),
      };

      // Protect against duplicate data WITHIN the JSON payload itself
      if (!memoryAccountIds.has(accountData.id) && !memoryAccountNames.has(accountData.name.toLowerCase())) {
        try {
          await createAccount(accountData, user!.sub, user!.name);
          memoryAccountIds.add(accountData.id);
          memoryAccountNames.add(accountData.name.toLowerCase());
          accountsImported++;
        } catch (e: any) {
          if (e.code === 'P2002') {
             console.warn(`Account ${acc.id} intra-json duplicate detected.`);
             memoryAccountIds.add(acc.id);
             memoryAccountNames.add(acc.name.toLowerCase());
          } else {
             throw e;
          }
        }
      }
    }

    // 3. Import Journals
    const memoryJournalIds = new Set<string>();
    let journalsImported = 0;
    for (const j of importJournals) {
      if (!memoryJournalIds.has(j.id)) {
        const entry: JournalEntry = {
          orgId,
          id: j.id,
          date: normalizeDate(j.date),
          description: j.description,
          tags: j.tags,
          createdAt: j.createdAt || new Date().toISOString(),
        };
        const lines: JournalLine[] = j.lines.map((l: any) => ({
          orgId,
          journalId: l.journalId || j.id,
          id: l.id,
          accountId: l.accountId,
          amount: l.amount,
          date: normalizeDate(l.date || j.date),
          description: l.description || "",
        }));
        
        await createJournalEntry(entry, lines, user!.sub, user!.name);
        memoryJournalIds.add(j.id);
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
