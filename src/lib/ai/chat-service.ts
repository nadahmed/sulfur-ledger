import { streamText, stepCountIs } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { saveChatMessage } from "@/lib/db/ai";
import { createAiTools } from "@/lib/ai/tools";
import { pusherServer } from "@/lib/pusher";

export interface ChatTurnOptions {
  org: any;
  messages: any[];
  userId: string;
  userName: string;
  role: string;
  isOwner: boolean;
  localTime: string;
  fullBaseUrl: string;
  abortSignal?: AbortSignal;
  skipUserSave?: boolean;
}

export async function processChatTurn({
  org,
  messages,
  userId,
  userName,
  role,
  isOwner,
  localTime,
  fullBaseUrl,
  abortSignal,
  skipUserSave = false
}: ChatTurnOptions) {
  const orgId = org.orgId || org.id;
  const lastMessage = messages[messages.length - 1];

  // 1. Calculate Initials (needed for broadcast)
  const initials = userName
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .substring(0, 2);

  const timestamp = new Date().toISOString();

  // 2. Parallelize User Message Persistence and AI Initialization
  const userSavePromise = (!skipUserSave && lastMessage.role === "user") 
    ? (async () => {
        try {
          const savedUserMsg = await saveChatMessage({
            orgId,
            id: lastMessage.id,
            role: "user",
            content: lastMessage.content,
            userId,
            userName,
            userInitials: initials,
            timestamp: lastMessage.timestamp || timestamp,
          });

          if (savedUserMsg) {
            await pusherServer.trigger(`org-${orgId}`, "ai-message", {
              id: savedUserMsg.id,
              role: "user",
              content: savedUserMsg.content,
              timestamp: savedUserMsg.timestamp,
              metadata: { userInitials: initials, userName }
            });
          }
        } catch (err) {
          console.error("[AI] Non-blocking user message save failure:", err);
        }
      })()
    : Promise.resolve();

  // 3. Provider & Model Selection
  const aiSettings = org.aiSettings || { provider: "system" };
  const providerType = aiSettings.provider === "system" ? (process.env.AI_PROVIDER || "google") : aiSettings.provider;
  const apiKey = aiSettings.provider === "system" ? process.env.AI_API_KEY : aiSettings.apiKey;
  const modelName = aiSettings.provider === "system" ? (process.env.AI_MODEL || "gemini-1.5-flash-latest") : aiSettings.model;
  const baseUrl = aiSettings.provider === "system" ? process.env.AI_BASE_URL : aiSettings.baseUrl;

  if (!apiKey || apiKey === "SET_YOUR_KEY_HERE") {
    throw new Error(aiSettings.provider === "system" 
      ? "System AI API Key is not configured." 
      : "Organization AI API Key is not configured.");
  }

  // 4. System Prompt
  const systemPrompt = `
You are Sulfur, a world-class female financial expert and CFO assistant for "${org.name}". You use she/her pronouns.
Your goal is to help users manage their ledger with precision.\n
PERSONALITY & STYLE:\n${aiSettings.personality || "Very rigid, efficient and to the point."}\n
CONTEXT:\n- Organization Name: ${org.name}
- Currency: ${org.currencySymbol || "Taka"}
- Current Date/Time: ${localTime || new Date().toLocaleString()}
- User: ${userName} (Role: ${role}${isOwner ? ", Owner" : ""})
- DATE FORMATS: ALWAYS use YYYY-MM-DD for tools; ALWAYS use verbose formats (e.g. April 12, 2026) in speech.
- NO TABLES/CHARTS: Describe data in text only.
- SOURCE OF TRUTH: Always use official reporting tools (get_financial_report, etc).
`.trim();

  // 5. Model Initialization
  let model: any;
  if (providerType === "google") {
    const googleProvider = createGoogleGenerativeAI({ apiKey });
    model = googleProvider(modelName || "gemini-1.5-flash-latest");
  } else {
    const openaiProvider = createOpenAI({ apiKey, baseURL: baseUrl || undefined });
    model = openaiProvider(modelName || "gpt-4o");
  }

  // 6. Execute AI Task
  const tools = createAiTools(orgId, userId, userName, role, isOwner);
  
  const result = await streamText({
    model,
    system: systemPrompt,
    messages,
    tools,
    abortSignal,
    stopWhen: stepCountIs(5),
    onFinish: async ({ text }) => {
      if (abortSignal?.aborted) {
        console.log("[AI] Task aborted, skipping broadcast.");
        return;
      }

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
        }).catch(err => console.error("[AI] Pusher trigger for assistant failed:", err));
      }
    },
  });

  return result;
}
