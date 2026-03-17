import { getJournalEntriesWithLines } from "../src/lib/db/journals";
import { config } from "dotenv";
config({ path: ".env.local" });

async function test() {
  const orgId = process.env.ACTIVE_ORG_ID || "google-oauth2|111255427906830971623";
  console.log(`Testing with Org ID: ${orgId}`);

  const date = "2026-03-14";
  console.log(`Querying journals for date: ${date}`);
  
  const result = await getJournalEntriesWithLines(orgId, 10, undefined, date);
  console.log(`Result length: ${result.data.length}`);
  console.log(`First entry date: ${result.data[0]?.date}`);
}

test().catch(console.error);
