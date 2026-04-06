import { Config, Context } from "@netlify/functions";
import { processDueRecurringEntries } from "../../src/lib/recurring-engine";

export default async (req: Request, context: Context) => {
  console.log("Running scheduled recurring entries process...");
  try {
    const results = await processDueRecurringEntries();
    console.log(`Processed ${results.processed} entries, ${results.errors} errors.`);
    return new Response(JSON.stringify(results), { 
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error: any) {
    console.error("Critical error in scheduled function:", error);
    return new Response(JSON.stringify({ error: error.message || "Internal Error" }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};

export const config: Config = {
  // Run every day at 00:00 UTC
  schedule: "0 0 * * *",
};
