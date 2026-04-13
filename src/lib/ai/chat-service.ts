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
  ipAddress?: string;
  userAgent?: string;
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
  skipUserSave = false,
  ipAddress,
  userAgent
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

🛡️ BEHAVIORAL GUIDELINES:
- HARD RULES (Enforcement):
  * NEVER record a journal entry without two distinct, active accounts.
  * NEVER use a tag that hasn't been created/found in 'get_tags'.
  * NEVER use archived accounts for mutations.
  * ALWAYS ensure amounts are positive.
  * NEVER state, quote, or infer any account balance without first calling get_financial_report('balance-sheet') or get_account_balance. Deriving balances from net profit/loss is STRICTLY FORBIDDEN.

- SOFT SUGGESTIONS (Consultative Coaching):
  * ONBOARDING: If the chart of accounts is empty, proactively suggest creating 'Asset', 'Expense', and 'Opening Balance Equity' (Equity) accounts first.
  * STARTING BALANCES: If a user mentions a current balance, suggest creating/using an 'Opening Balance Equity' account as the source. Do not record a one-sided entry.
  * ASSET vs EXPENSE: For large purchases (electronics, furniture), ask the user if they'd like to track it as an Asset (Equipment) rather than a one-time expense.
  * TRANSFERS: Identify Asset-to-Asset moves (Bank to Cash) as 'Transfers'. Explain they don't affect net savings.
  * DEBT: Suggest splitting loan/card payments into Principal (Liability) and Interest (Expense).
- BE BEGINNER FRIENDLY: Explain accounting concepts simply. Use the user's terminology but suggest formal mappings.
`.trim();

  // 5. Model Initialization
  let model: any;
  if (providerType === "google") {
    const googleProvider = createGoogleGenerativeAI({ apiKey });
    model = googleProvider(modelName || "gemini-1.5-flash-latest");
  } else {
    const openaiProvider = createOpenAI({ 
      apiKey, 
      baseURL: baseUrl || undefined,
      // 'compatible' forces /v1/chat/completions instead of /v1/responses.
      // Required for Ollama and other OpenAI-compatible local providers.
      compatibility: "compatible",
    });
    model = openaiProvider(modelName || "gpt-4o");
  }

  // 6. Execute AI Task
  const tools = createAiTools(orgId, userId, userName, role, isOwner, ipAddress, userAgent);
  
  const result = await streamText({
    model,
    system: systemPrompt,
    messages,
    tools,
    abortSignal,
    stopWhen: stepCountIs(5),
  });

  // WAIT FOR COMPLETION
  const fullText = await result.text;
  
  // If we were aborted during the LLM call, stop here
  if (abortSignal?.aborted) {
    console.log("[AI] Task aborted after text generation, skipping finalize.");
    return null;
  }

  // 7. Finalize (Save & Broadcast Assistant Message)
  const savedMsg = await saveChatMessage({
    orgId,
    role: "assistant",
    content: fullText,
    timestamp: new Date().toISOString(),
  }).catch(err => {
    console.error("[AI] Failed to save assistant message:", err);
    return null;
  });

  if (savedMsg) {
    await pusherServer.trigger(`org-${orgId}`, "ai-message", {
      id: savedMsg.id,
      role: "assistant",
      content: fullText,
      timestamp: savedMsg.timestamp,
    }).catch(err => console.error("[AI] Pusher trigger for assistant failed:", err));
  }

  // Ensure user save is also done (if we were waiting for it)
  await userSavePromise;

  return savedMsg;
}
