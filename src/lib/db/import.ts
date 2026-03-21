import { parse } from "csv-parse/sync";
import { randomUUID } from "crypto";
import { createAccount, getAccounts, AccountCategory } from "./accounts";
import { createJournalEntry, JournalEntry, JournalLine } from "./journals";

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

function parseAmount(amtStr: string): number {
  if (!amtStr) return 0;
  // Handle currencies and commas
  const cleaned = amtStr.replace(/[৳,]/g, "").trim();
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : Math.round(parsed * 100);
}

function parseDateStr(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date format: ${dateStr}`);
  }
  
  // Use Intl.DateTimeFormat to force interpret the date for Asia/Dhaka
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  
  // en-CA locale with these options returns YYYY-MM-DD
  return formatter.format(d);
}

export async function importJournalsFromCsv(orgId: string, csvContent: string) {
  const records: any[] = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
  });

  // Load existing accounts
  const existingAccounts = await getAccounts(orgId);
  const accountMap = new Map<string, string>(); // name -> id
  for (const acc of existingAccounts) {
    accountMap.set(acc.name, acc.id);
  }

  // Find unique account names in CSV
  const uniqueNames = new Set<string>();
  for (const record of records) {
    const from = record["From (Source)"]?.trim();
    const to = record["To (Destination)"]?.trim();
    if (from) uniqueNames.add(from);
    if (to) uniqueNames.add(to);
  }

  // Create missing accounts
  for (const name of uniqueNames) {
    if (!accountMap.has(name)) {
      const id = randomUUID();
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

  // Insert journals
  let count = 0;
  for (const record of records) {
    const dateStr = record["Date"]?.trim();
    const desc = record["Description"]?.trim() || "No Description";
    const amountStr = record["Amount"]?.trim();
    const fromName = record["From (Source)"]?.trim();
    const toName = record["To (Destination)"]?.trim();
    const notes = record["Notes"]?.trim();

    if (!dateStr || !amountStr || !fromName || !toName) continue;

    const amount = parseAmount(amountStr);
    const date = parseDateStr(dateStr);
    const fromId = accountMap.get(fromName)!;
    const toId = accountMap.get(toName)!;
    const journalId = randomUUID();

    const entry: JournalEntry = {
      orgId,
      id: journalId,
      date,
      description: desc,
      createdAt: new Date().toISOString(),
    };

    const lines: JournalLine[] = [
      {
        orgId,
        journalId: journalId,
        accountId: toId,
        amount: amount, // Debit (positive)
        date,
      },
      {
        orgId,
        journalId: journalId,
        accountId: fromId,
        amount: -amount, // Credit (negative)
        date,
      },
    ];

    await createJournalEntry(entry, lines, "system-import");
    count++;
  }

  return { importedCount: count };
}
