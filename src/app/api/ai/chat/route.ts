import { checkPermission } from "@/lib/auth";
import { getOrganization } from "@/lib/db/organizations";
import { saveChatMessage } from "@/lib/db/ai";
import { processChatTurn } from "@/lib/ai/chat-service";

import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, orgId, localTime } = body;
    console.log("[AI CHAT DEBUG] POST Body (Vercel AI SDK):", JSON.stringify(body, null, 2));

    if (!orgId) return Response.json({ error: "orgId required" }, { status: 400 });

    // 1. Auth & Context
    const auth = await checkPermission("view:dashboard", req);
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

    const org = await getOrganization(orgId);
    if (!org) return Response.json({ error: "Organization not found" }, { status: 404 });

    const userId = auth.user?.sub || "unknown";
    const userName = auth.user?.name || auth.user?.nickname || "User";
    const lastMessage = messages[messages.length - 1];

    // Calculate initials
    const initials = userName
      .split(" ")
      .map((n: string) => n[0])
      .join("")
      .toUpperCase()
      .substring(0, 2);

    // 2. Identify Role & Owner Status
    const isOwner = userId === org.ownerId;
    const role = auth.role || "viewer";

    // 3. Provider & Model Selection
    const aiSettings = org.aiSettings || { provider: "system" };
    const providerType = aiSettings.provider === "system" ? (process.env.AI_PROVIDER || "google") : aiSettings.provider;
    const apiKey = aiSettings.provider === "system" ? process.env.AI_API_KEY : aiSettings.apiKey;
    const modelName = aiSettings.provider === "system" ? (process.env.AI_MODEL || "gemini-1.5-flash-latest") : aiSettings.model;
    const baseUrl = aiSettings.provider === "system" ? process.env.AI_BASE_URL : aiSettings.baseUrl;

    // API Key Validation
    if (!apiKey || apiKey === "SET_YOUR_KEY_HERE") {
      const msg = aiSettings.provider === "system"
        ? "System AI API Key is not configured in .env.local"
        : "Organization AI API Key is not configured in Settings";
      return Response.json({ error: msg }, { status: 400 });
    }

    // 5. Shared Service Options
    const host = req.headers.get("host") || "localhost:3000";
    const protocol = req.headers.get("x-forwarded-proto") || "http";
    const fullBaseUrl = `${protocol}://${host}`;

    // Capture Real IP
    const ipAddress = req.headers.get("x-nf-client-connection-ip") || 
                      req.headers.get("x-forwarded-for")?.split(",")[0].trim() || 
                      (req as any).ip || 
                      "unknown";
    const userAgent = "AI Agent";

    const chatOptions = {
      org,
      messages,
      userId,
      userName,
      role,
      isOwner,
      localTime,
      fullBaseUrl,
      ipAddress,
      userAgent
    };

    // 6. Execution with Failover
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.log("[AI] Timeout hit (8.5s). Handing off to background task.");
      controller.abort();
      
      // Trigger background function (fire and forget)
      const isProd = process.env.NODE_ENV === "production";
      const bgUrl = isProd 
        ? `${fullBaseUrl}/.netlify/functions/ai-chat-background`
        : `${fullBaseUrl}/api/ai/chat/background`; // Generic fallback for local dev
      
      fetch(bgUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...chatOptions, skipUserSave: true })
      }).catch(err => console.error("[AI] Failed to trigger background task:", err));

    }, 8500);

    try {
      await processChatTurn({
        ...chatOptions,
        abortSignal: controller.signal
      });

      clearTimeout(timeoutId);
      return Response.json({ success: true, mode: "sync" });
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return Response.json({ success: true, mode: "background" }, { status: 202 });
      }
      throw err;
    }

  } catch (error: any) {
    console.error("[AI Chat Error]:", error);
    return Response.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}

