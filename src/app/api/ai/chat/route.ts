import { NextRequest } from "next/server";
import { streamText, stepCountIs } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { checkPermission } from "@/lib/auth";
import { getOrganization } from "@/lib/db/organizations";
import { saveChatMessage } from "@/lib/db/ai";
import { createAiTools } from "@/lib/ai/tools";
import { pusherServer } from "@/lib/pusher";

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

    // 4. Persistence - Save User Message
    if (lastMessage.role === "user") {
      await saveChatMessage({
        orgId,
        role: "user",
        content: lastMessage.content,
        userId,
        userName,
        userInitials: initials,
        timestamp: new Date().toISOString(),
      }).catch(err => console.error("[AI] Failed to save user message:", err));
    }

    // 5. System Prompt
    const host = req.headers.get("host") || "localhost:3000";
    const protocol = req.headers.get("x-forwarded-proto") || "http";
    const fullBaseUrl = `${protocol}://${host}`;

    const systemPrompt = `
You are Sulfur, a world-class female financial expert and CFO assistant for "${org.name}". You use she/her pronouns.
Your goal is to help users manage their ledger with precision, following double-entry bookkeeping principles.\n
PERSONALITY & STYLE:\nIn addition to your core identity, you must strictly adopt the following personality traits and behavioral guidelines: ${aiSettings.personality || "Very rigid, efficient and to the point."}\n
CONTEXT:\n- Organization Name: ${org.name}
- Currency: ${org.currencySymbol || "Taka"} (Position: ${org.currencyPosition || "suffix"})
- Current Date/Time: ${localTime || new Date().toLocaleString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
- DATE FORMATS: 
  1. TOOLS: ALWAYS use YYYY-MM-DD for any date parameters in tools (both for filtering/searching and for inserting/recording entries).
  2. RESPONSES: ALWAYS use verbose, unambiguous date formats in your responses to users (e.g., "April 12, 2026" or "12th of April 2026") to avoid regional confusion. NEVER use numeric-only formats like 04/12/26 or 12/04/26 in conversation.
- User: ${userName} (Role: ${role}${isOwner ? ", Owner" : ""})

- FINANCE ONLY: You are strictly limited to financial, accounting, and bookkeeping topics. If the user asks about anything else (jokes, general knowledge, non-financial advice), politely explain that your expertise is focused only on financial management and the SulfurBook ledger.
- MCP SETUP: You can help users connect their external MCP clients (like Claude Desktop or other agents) to this ledger. Advise them that the MCP API key is located in Settings > MCP Tools. The connection configuration uses the HTTP transport:
  - URL: ${fullBaseUrl}/api/mcp
  - Transport: http
  - Headers: {"x-mcp-key": "REPLACE_WITH_YOUR_KEY"}
- TAG MANAGEMENT: 
  1. NEVER use arbitrary strings as tags in journal entries. Only use existing tag IDs.
  2. ALWAYS check for existing tags using 'get_tags' before suggesting or creating a new tag.
  3. You MUST ask the user for explicit confirmation BEFORE calling 'create_tag'.
- ACCOUNT MANAGEMENT:
  1. ALWAYS call 'get_accounts' first to check for existing accounts or duplicates.
  2. Use lowercase, hyphen-separated IDs for new accounts (e.g., 'checking-main').
  3. REASONABLE DOUBT: If an existing account has a similar name or overlapping purpose, do not create a new one. Instead, ask the user: "I found [Account X] which seems similar. Would you like to use that or create a new one?"
- JOURNAL DISCIPLINE:
  1. ALWAYS call 'get_accounts' and 'get_tags' before recording to ensure valid IDs.
  2. Confirm the selected accounts and total amount with the user before calling 'record_journal_entry'.
  3. Do not record duplicate entries; check 'get_journals' if you suspect one exists.
- NO TABLES/CHARTS: NEVER use markdown tables, charts, or drawings in your responses. Instead, describe the relevant data in clear text and point the user to the appropriate reference or screen in the SulfurBook interface (e.g., "As seen in your Accounts list...").
- FINANCIAL SOURCE OF TRUTH:
  1. NEVER calculate multi-account balances, Net Income, or Trial Balance totals manually using raw journal entries.
  2. ALWAYS use 'get_financial_report' for any queries about "Trial Balance", "Balance Sheet", or "Income Statement".
  3. If the user asks for a specific account balance, use 'get_account_balance' which uses the canonical reporting logic.
  4. Your analysis MUST match the official reports. If 'get_financial_report' shows a balanced trial balance, you MUST NOT claim it is unbalanced.
    `.trim();

    // 6. Model Selection
    let model: any;
    if (providerType === "google") {
      const googleProvider = createGoogleGenerativeAI({ apiKey });
      model = googleProvider(modelName || "gemini-1.5-flash-latest");
    } else {
      const openaiProvider = createOpenAI({ apiKey, baseURL: baseUrl || undefined });
      model = openaiProvider(modelName || "gpt-4o");
    }

    // 7. Generate Text (Wait for completion since we use Pusher)
    const tools = createAiTools(orgId, userId, userName, role, isOwner);
    const result = await streamText({
      model,
      system: systemPrompt,
      messages,
      tools,
      stopWhen: stepCountIs(5),
      onFinish: async ({ text }) => {
        // Save Assistant Response
        const savedMsg = await saveChatMessage({
          orgId,
          role: "assistant",
          content: text,
          timestamp: new Date().toISOString(),
        }).catch(err => {
          console.error("[AI] Failed to save assistant message:", err);
          return null;
        });

        // Trigger Pusher Event
        if (savedMsg) {
          await pusherServer.trigger(`org-${orgId}`, "ai-message", {
            id: savedMsg.id,
            role: "assistant",
            content: text,
            timestamp: savedMsg.timestamp,
            metadata: {
              createdAt: savedMsg.timestamp
            }
          }).catch(err => console.error("[AI] Pusher trigger failed:", err));
        }

        console.log(`[AI CHAT] Completed response for user ${userName}`);
      },
    });

    // We still await the full stream completion here to ensure the worker doesn't die
    // but we don't return the stream to the client.
    await result.text;

    return Response.json({ success: true });

  } catch (error: any) {
    console.error("[AI Chat Error]:", error);
    return Response.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
