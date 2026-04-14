import { prisma } from "../prisma";
import { uuidv7 } from "uuidv7";

export type JobStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
export type JobOwner = "SYNC" | "BACKGROUND";

export interface AiJob {
  orgId: string;
  requestId: string;
  status: JobStatus;
  owner?: JobOwner;
  lastActive: string;
  startTime: string;
  // Step results: toolCallId -> result string
  results: Record<string, any>;
  // The original tool calls (intent)
  toolCalls: any[];
}

/**
 * Initialize or get an existing job record.
 */
export async function getOrCreateJob(orgId: string, requestId: string): Promise<AiJob> {
  const job = await prisma.aiJob.findUnique({
    where: { id: requestId },
  });

  if (job) {
    return {
      orgId: job.orgId,
      requestId: job.id,
      status: job.status as JobStatus,
      owner: (job.owner as JobOwner) || undefined,
      lastActive: job.lastActive.toISOString(),
      startTime: job.startTime.toISOString(),
      results: (job.results as Record<string, any>) || {},
      toolCalls: (job.toolCalls as any[]) || [],
    };
  }

  const now = new Date();
  const newJob = await prisma.aiJob.create({
    data: {
      id: requestId,
      orgId,
      status: "PENDING",
      lastActive: now,
      startTime: now,
      results: {},
      toolCalls: [],
    },
  });

  return {
    orgId: newJob.orgId,
    requestId: newJob.id,
    status: newJob.status as JobStatus,
    owner: (newJob.owner as JobOwner) || undefined,
    lastActive: newJob.lastActive.toISOString(),
    startTime: newJob.startTime.toISOString(),
    results: (newJob.results as Record<string, any>) || {},
    toolCalls: (newJob.toolCalls as any[]) || [],
  };
}

/**
 * Atomically claim the job for a specific process (SYNC or BACKGROUND).
 * Uses a conditional update to ensure only one process "owns" the job.
 */
export async function claimJob(orgId: string, requestId: string, owner: JobOwner): Promise<boolean> {
  const now = new Date();
  const staleTime = new Date(Date.now() - 15000);

  // We use updateMany to emulate a conditional update
  const result = await prisma.aiJob.updateMany({
    where: {
      id: requestId,
      orgId,
      OR: [
        { status: "PENDING" },
        { 
          AND: [
            { status: { not: "COMPLETED" } },
            { 
              OR: [
                { owner: null },
                { owner: owner },
                { 
                  AND: [
                    { owner: "SYNC" },
                    { lastActive: { lt: staleTime } }
                  ]
                }
              ]
            }
          ]
        }
      ]
    },
    data: {
      status: "PROCESSING",
      owner: owner,
      lastActive: now,
    }
  });

  return result.count > 0;
}

/**
 * Record tool calls (Intent) before they are executed.
 */
export async function recordToolCalls(orgId: string, requestId: string, toolCalls: any[]) {
  await prisma.aiJob.update({
    where: { id: requestId, orgId },
    data: {
      toolCalls: toolCalls,
      lastActive: new Date(),
    },
  });
}

/**
 * Records a tool result into the job's state.
 */
export async function recordToolResult(
  orgId: string, 
  requestId: string, 
  toolCallId: string, 
  result: any, 
  toolName?: string, 
  args?: any
) {
  const job = await prisma.aiJob.findUnique({
    where: { id: requestId, orgId },
    select: { results: true }
  });

  if (!job) return;

  const results = (job.results as Record<string, any>) || {};
  results[toolCallId] = {
    toolName,
    args,
    result,
    timestamp: new Date().toISOString()
  };

  await prisma.aiJob.update({
    where: { id: requestId },
    data: {
      results: results,
      lastActive: new Date(),
    },
  });
}

/**
 * Find or claim an existing tool call step.
 */
export async function claimStep(
  orgId: string, 
  requestId: string, 
  _toolName: string, 
  args: any
): Promise<{ result?: any; providedId: string }> {
  const job = await getOrCreateJob(orgId, requestId);
  
  const argsHash = Buffer.from(JSON.stringify(args)).toString("base64").substring(0, 16);
  
  // 3. Mapping: Check if we already have a UUIDv7 for this specific tool call in this turn
  const mapping = (job.results as any)?.__provided_ids__ || {};
  
  if (mapping[argsHash]) {
    const providedId = mapping[argsHash];
    const entry = job.results[providedId];
    if (entry) {
      const finalResult = (typeof entry === 'object' && entry !== null && 'result' in entry) 
        ? entry.result 
        : entry;
      return { result: finalResult, providedId };
    }
    return { providedId };
  }

  // 4. Generate NEW UUIDv7 for this tool call
  const providedId = uuidv7();
  mapping[argsHash] = providedId;

  const results = (job.results as Record<string, any>) || {};
  results.__provided_ids__ = mapping;

  await prisma.aiJob.update({
    where: { id: requestId },
    data: { 
      results: results,
      lastActive: new Date() 
    },
  });

  return { providedId };
}

/**
 * Finalize the job.
 */
export async function completeJob(orgId: string, requestId: string) {
  await prisma.aiJob.update({
    where: { id: requestId, orgId },
    data: {
      status: "COMPLETED",
      lastActive: new Date(),
    },
  });
}
