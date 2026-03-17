import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";
import { randomUUID } from "crypto";
import { config } from "dotenv";
config({ path: ".env.local" });

import { createAccount, getAccounts, AccountCategory } from "../src/lib/db/accounts";
import { createJournalEntry, JournalEntry, JournalLine } from "../src/lib/db/journals";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { db, TABLE_NAME } from "../src/lib/dynamodb";

let ORG_ID = "default_org"; 

function inferCategory(name: string): AccountCategory {
  const lowerName = name.toLowerCase();
  if (["cash wallet", "city bank", "prime bank", "bkash"].includes(lowerName) || lowerName.includes("recievable")) {
    return "asset";
  }
  if (lowerName.includes("payable")) {
    return "liability";
  }
  if (lowerName.includes("starting balance") || lowerName.includes("drawings")) {
    return "equity";
  }
  if (lowerName.includes("income")) {
    return "income";
  }
  return "expense";
}

function parseAmount(amtStr: string): number {
  const cleaned = amtStr.replace(/[৳,]/g, "").trim();
  const parsed = parseFloat(cleaned);
  return Math.round(parsed * 100);
}

function parseDateStr(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date format: ${dateStr}`);
  }
  
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  
  return formatter.format(d);
}

async function run() {
  console.log("Loading CSV...");
  const rawCsv = readFileSync("journals.csv", "utf8");
  const records: any[] = parse(rawCsv, {
    columns: true,
    skip_empty_lines: true,
  });

  console.log(`Parsed ${records.length} records.`);

  console.log("Detecting ORG_ID...");
  const scanRes = await db.send(new ScanCommand({ TableName: TABLE_NAME, Limit: 1 }));
  if (scanRes.Items && scanRes.Items.length > 0 && scanRes.Items[0].orgId) {
    ORG_ID = scanRes.Items[0].orgId;
    console.log(`Detected ORG_ID: ${ORG_ID}`);
  } else {
    console.log(`No existing items found. Using default ORG_ID: ${ORG_ID}`);
  }

  // Load existing accounts
  console.log("Loading existing accounts...");
  const existingAccounts = await getAccounts(ORG_ID);
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
      console.log(`Creating account: ${name} (${cat})`);
      await createAccount({
        orgId: ORG_ID,
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
  console.log("Inserting journals...");
  let count = 0;
  for (const record of records) {
    const dateStr = record["Date"];
    const desc = record["Description"] || "No Description";
    const amountStr = record["Amount"];
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
      orgId: ORG_ID,
      id: journalId,
      date,
      description: desc,
      notes: notes || undefined,
      createdAt: new Date().toISOString(),
    };

    const lines: JournalLine[] = [
      {
        orgId: ORG_ID,
        journalId,
        accountId: toId,
        amount: amount, // Debit (positive)
        date,
      },
      {
        orgId: ORG_ID,
        journalId,
        accountId: fromId,
        amount: -amount, // Credit (negative)
        date,
      },
    ];

    try {
      await createJournalEntry(entry, lines);
      count++;
      if (count % 50 === 0) console.log(`Inserted ${count} journals...`);
    } catch (e: any) {
      console.error(`Error inserting journal (Row ${count+1}):`, e.message);
    }
  }

  console.log(`Successfully inserted ${count} journal entries!`);
}

run().catch(console.error);
