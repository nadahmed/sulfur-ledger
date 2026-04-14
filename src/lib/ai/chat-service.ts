import { streamText, stepCountIs } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { saveChatMessage } from "@/lib/db/ai";
import { createAiTools } from "@/lib/ai/tools";
import { pusherServer } from "@/lib/pusher";
import { claimJob, completeJob, getOrCreateJob } from "@/lib/db/ai-requests";

export interface ChatTurnOptions {
  org: any;
  messages: any[];
  userId: string;
  userName: string;
  role: string;
  isOwner: boolean;
  localTime: string;
  fullBaseUrl: string;
  requestId: string;
  processMode: "SYNC" | "BACKGROUND";
  abortSignal?: AbortSignal;
  skipUserSave?: boolean;
  ipAddress?: string;
  userAgent?: string;
}

export type ChatTurnResult = {
  status: "success" | "skipped" | "background" | "error";
  message?: any;
  reason?: string;
};

export async function processChatTurn({
  org,
  messages,
  userId,
  userName,
  role,
  isOwner,
  localTime,
  fullBaseUrl,
  requestId,
  processMode,
  abortSignal,
  skipUserSave = false,
  ipAddress,
  userAgent
}: ChatTurnOptions) {
  console.log(`[AI] Processing Turn for Org: ${JSON.stringify(org)}`);
  const orgId = org.orgId || org.id;
  const lastMessage = messages[messages.length - 1];

  // 1. Ensure Job Record exists (Needed for Postgres consistent updates)
  const job = await getOrCreateJob(orgId, requestId);

  // 2. Atomic Job Claim
  const canProceed = await claimJob(orgId, requestId, processMode);
  if (!canProceed) {
    console.log(`[AI] Request ${requestId} already being processed or completed. Skipping.`);
    
    // If it was already completed, try to fetch the assistant response to return it
    if (job.status === "COMPLETED") {
      return { status: "skipped" as const, reason: "Already processed" };
    }
    
    return { status: "skipped" as const, reason: "In progress" };
  }

  // 3. Re-hydration: Check for existing tool results in Job State
  const rehydratedMessages = [...messages];

  // If we have results, we need to inject them into the conversation
  // so the LLM knows what happened in the previous (killed) process.
  if (job.results && Object.keys(job.results).length > 0) {
    console.log(`[AI] Rehydrating ${Object.keys(job.results).length} results for ${requestId}`);
    
    // We group results by "turn" if possible, but for simplicity we can just
    // add one giant assistant/tool block or multiple blocks.
    // The SDK handles sequences of assistant/tool messages fine.
    
    const toolCalls: any[] = [];
    const toolResults: any[] = [];

    // Sort by timestamp if available to maintain order
    const sortedEntries = Object.entries(job.results).sort((a: any, b: any) => {
      const tsA = a[1]?.timestamp || "";
      const tsB = b[1]?.timestamp || "";
      return tsA.localeCompare(tsB);
    });

    for (const [id, entry] of sortedEntries as [string, any][]) {
      if (typeof entry === 'object' && entry !== null && entry.toolName) {
        toolCalls.push({
          type: 'tool-call',
          toolCallId: id,
          toolName: entry.toolName,
          args: entry.args
        });
        toolResults.push({
          toolCallId: id,
          toolName: entry.toolName,
          result: entry.result
        });
      }
    }

    if (toolCalls.length > 0) {
      rehydratedMessages.push({
        role: 'assistant',
        content: '',
        toolCalls
      } as any);
      rehydratedMessages.push({
        role: "tool",
        content: toolResults
      } as any);

      console.log(`[AI] REHYDRATED HISTORY: Added ${toolCalls.length} tool calls and ${toolResults.length} results.`);
      toolResults.forEach(r => console.log(`  - Tool: ${r.toolName}, Result length: ${String(r.result).length}`));
    }
  }

  // Calculate Initials (needed for broadcast)
  const initials = userName
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .substring(0, 2);

  const timestamp = new Date().toISOString();

  // 3. User Message Persistence (Non-blocking)
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

  // 4. Provider & Model Selection
  const aiSettings = org.aiSettings || { provider: "system" };
  const providerType = aiSettings.provider === "system" ? (process.env.AI_PROVIDER || "google") : aiSettings.provider;
  const apiKey = aiSettings.provider === "system" ? process.env.AI_API_KEY : aiSettings.apiKey;
  const modelName = aiSettings.provider === "system" ? (process.env.AI_MODEL || "gemini-1.5-flash-latest") : aiSettings.model;
  const baseUrl = aiSettings.provider === "system" ? process.env.AI_BASE_URL : aiSettings.baseUrl;

  if (!apiKey || apiKey === "SET_YOUR_KEY_HERE") {
    throw new Error(aiSettings.provider === "system" ? "System AI API Key not configured." : "Org AI API Key not configured.");
  }

  const systemPrompt = `
You are Sulfur (v2), a elite financial expert for "${org.name}".
PERSONALITY:\n${aiSettings.personality || "Rigid, efficient, and proactive."}\n
CONTEXT:\n- Organization: ${org.name}\n- Currency: ${org.currencySymbol || "Taka"}\n- Time: ${localTime || new Date().toLocaleString()}
- User: ${userName} (${role})

STRATEGY:
1. ALWAYS call 'get_accounts' first if you are unsure about account names of IDs. 
2. 'get_accounts' returns a TEXT LIST of format: \"- [category] Name (ID: uuid)\".
3. MAP user descriptions (e.g., \"cash\", \"bank\") to the official Names/IDs found in that list.
4. If a user says \"cash\" and you find \"Cash Wallet (ID: 1796d6...)\", use that UUID for recording.
5. If an exact match isn't found, perform a case-insensitive search or match by semantic similarity (e.g. \"City Bank\" -> \"Citybank\"). 
6. If the accounts don't exist yet, FIRST call 'create_account' for each required account, THEN record the entries. You can do this in the same turn.
7. NEVER call the same tool with the same arguments twice in one turn.

- ALWAYS use YYYY-MM-DD for tools.
- SOURCE OF TRUTH: Always use official reporting tools.
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

  // 6. Execute AI Task with Intermediate Step Persistence
  const tools = createAiTools(orgId, userId, userName, role, isOwner, requestId, ipAddress, userAgent);

  const result = await streamText({
    model,
    system: systemPrompt,
    messages: rehydratedMessages,
    tools,
    abortSignal,
    stopWhen: stepCountIs(20),
    onStepFinish: async ({ text, toolCalls, toolResults }) => {
      console.log(`[AI TRACE] Turn: ${requestId}. Step Finish.`);
      if (toolCalls.length > 0) {
        console.log(`  Tools Called: ${toolCalls.map(tc => tc.toolName).join(", ")}`);
      }
      if (toolResults.length > 0) {
        console.log(`  Results obtained: ${toolResults.length}`);
      }
      // Heartbeat: update job as still active
      await claimJob(orgId, requestId, processMode);
    }
  });

  // WAIT FOR COMPLETION
  const fullText = await result.text;

  if (abortSignal?.aborted) {
    console.log("[AI] Task aborted, state remains for background process.");
    return { status: "background" };
  }

  // 7. Finalize
  let responseText = fullText;
  if (!responseText || responseText.trim() === "") {
    // Re-fetch job to get latest results from all tool calls
    const finalJob = await getOrCreateJob(orgId, requestId);
    const results = finalJob.results || {};
    const toolRunCount = Object.keys(results).length;

    if (toolRunCount > 0) {
      const summaryList = Object.entries(results).map(([key, val]) => {
        if (typeof val === 'string') return val;
        if (typeof val === 'object') return JSON.stringify(val, null, 2);
        return String(val);
      });
      responseText = `I've processed your request:\n\n${summaryList.join("\n")}`;
    } else {
      responseText = "I've reviewed your request but no actions were required.";
    }
  }

  const savedMsg = await saveChatMessage({
    orgId,
    role: "assistant",
    content: responseText,
    timestamp: new Date().toISOString(),
  });

  if (savedMsg) {
    await pusherServer.trigger(`org-${orgId}`, "ai-message", {
      id: savedMsg.id,
      role: "assistant",
      content: responseText,
      timestamp: savedMsg.timestamp,
    });
  }

  // Mark Job as Completed
  await completeJob(orgId, requestId);

  await userSavePromise;
  return { status: "success", message: savedMsg };
}
