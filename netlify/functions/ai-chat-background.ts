import { processChatTurn } from "../../src/lib/ai/chat-service";
import type { Handler } from "@netlify/functions";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const chatOptions = JSON.parse(event.body || "{}");
    console.log("[BACKGROUND AI] Starting processing...");
    
    // Background functions in Netlify can run for up to 15 minutes
    await processChatTurn({
      ...chatOptions,
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
