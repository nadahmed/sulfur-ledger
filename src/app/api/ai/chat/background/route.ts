import { NextRequest } from "next/server";
import { processChatTurn } from "@/lib/ai/chat-service";

export async function POST(req: NextRequest) {
  try {
    const chatOptions = await req.json();
    console.log("[LOCAL BACKGROUND AI] Starting processing...");
    
    // This route serves as a fallback for local development or simple environments
    const result = await processChatTurn({
      ...chatOptions,
      skipUserSave: chatOptions.skipUserSave ?? true // Default to true for background if not specified
    });
    
    // Await full completion
    await result.text;
    
    console.log("[LOCAL BACKGROUND AI] Completed successfully.");
    return Response.json({ success: true, mode: "local-background" });
  } catch (error: any) {
    console.error("[LOCAL BACKGROUND AI] Error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
