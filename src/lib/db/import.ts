import { parse } from "csv-parse/sync";
import { uuidv7 } from "uuidv7";
import { createAccount, getAccounts, AccountCategory } from "./accounts";
import { normalizeDate, normalizeAmount } from "../utils";
import { recordImportEntry } from "../ledger";
import type { UserContext } from "../ledger";

function inferCategory(name: string): AccountCategory {
  const lowerName = name.toLowerCase();
  if (
    ["cash wallet", "city bank", "prime bank", "bkash"].includes(lowerName) ||
    lowerName.includes("recievable") ||
    lowerName.includes("starting cash")
  ) {
    return "asset";
  }
  if (lowerName.includes("payable")) return "liability";
  if (
    lowerName.includes("starting balance") ||
    lowerName.includes("drawings") ||
    lowerName.includes("equity")
  ) return "equity";
  if (lowerName.includes("income") || lowerName.includes("revenue")) return "income";
  return "expense";
}

function parseAmountStr(amtStr: string): number {
  if (!amtStr) return 0;
  const cleaned = amtStr.replace(/[৳,]/g, "").trim();
  return normalizeAmount(cleaned);
}

function parseDateStr(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) throw new Error(`Invalid date format: ${dateStr}`);
  // Use en-CA locale for YYYY-MM-DD output in Asia/Dhaka timezone
  return normalizeDate(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Dhaka",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d)
  );
}

export async function importJournalsFromCsv(
  orgId: string,
  csvContent: string,
  ctx: UserContext = { userId: "system-import" }
) {
  const records: any[] = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
  });

  // ── Auto-create missing accounts ──────────────────────────────────────────
  const existingAccounts = await getAccounts(orgId);
  const accountMap = new Map<string, string>(); // name -> id
  for (const acc of existingAccounts) accountMap.set(acc.name, acc.id);

  const uniqueNames = new Set<string>();
  for (const record of records) {
    const from = record["From (Source)"]?.trim();
    const to = record["To (Destination)"]?.trim();
    if (from) uniqueNames.add(from);
    if (to) uniqueNames.add(to);
  }

  for (const name of uniqueNames) {
    if (!accountMap.has(name)) {
      const id = uuidv7();
      const cat = inferCategory(name);
      await createAccount({
        orgId,
        id,
        name,
        category: cat,
        status: "active",
        createdAt: new Date().toISOString(),
      });
      accountMap.set(name, id);
    }
  }

  // ── Insert journal entries via LedgerService ──────────────────────────────
  let count = 0;
  for (const record of records) {
    const dateStr    = record["Date"]?.trim();
    const desc       = record["Description"]?.trim() || "No Description";
    const amountStr  = record["Amount"]?.trim();
    const fromName   = record["From (Source)"]?.trim();
    const toName     = record["To (Destination)"]?.trim();
    const tagsStr    = record["Tags"]?.trim();
    const notes      = record["Notes"]?.trim() || "";

    if (!dateStr || !amountStr || !fromName || !toName) continue;

    const amountPaisa = parseAmountStr(amountStr);
    const date        = parseDateStr(dateStr);
    const fromId      = accountMap.get(fromName)!;
    const toId        = accountMap.get(toName)!;

    await recordImportEntry(orgId, {
      date,
      description: desc,
      toAccountId: toId,
      fromAccountId: fromId,
      amountPaisa,
      tags: tagsStr ? tagsStr.split(",").map((t: string) => t.trim()).filter(Boolean) : [],
      notes,
    }, ctx);

    count++;
  }

  return { importedCount: count };
}
