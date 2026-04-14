import { processChatTurn } from "../../src/lib/ai/chat-service";
import { getOrCreateJob } from "../../src/lib/db/ai-requests";
import type { Handler } from "@netlify/functions";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const chatOptions = JSON.parse(event.body || "{}");
    const { org, requestId } = chatOptions;
    const orgId = org.orgId || org.id;

    console.log(`[BACKGROUND AI] Request ${requestId} received. Waiting for Sync gap...`);
    
    // Safety Wait: Ensure sync process has timed out (10s) before taking over.
    const job = await getOrCreateJob(orgId, requestId);
    // 1. SAFETY WAIT: Allow sync process to ideally finish or timeout
    // We wait 25s because the stale threshold in claimJob is 15s.
    await new Promise(r => setTimeout(r, 25000));

    // Background functions in Netlify can run for up to 15 minutes
    await processChatTurn({
      ...chatOptions,
      processMode: "BACKGROUND",
      skipUserSave: chatOptions.skipUserSave ?? true
    });
    
    console.log("[BACKGROUND AI] Completed successfully.");
    return {
      statusCode: 202,
      body: JSON.stringify({ message: "Task completed in background" }),
    };
  } catch (error: any) {
    console.error("[BACKGROUND AI] Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
