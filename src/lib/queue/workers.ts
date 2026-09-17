import { Worker, Job } from "bullmq";
import { env, getAgentMaxSteps } from "@/lib/config";
import { getCerebro } from "@/agents/mastra";
import "@/workers/mutation-analysis.worker";
import "@/workers/shadow-runner.worker";
import "@/workers/online-judge.worker";
import { VaultService } from "@/lib/db/vault-service";
import { buildComplianceTools } from "@/tools/compliance";
import { buildOnboardingTools } from "@/tools/onboarding";
import { buildSharedTools } from "@/tools/shared";
import { assertAgentToolAllowlist } from "@/lib/policy/toolAllowlists";
import { buildClientMemoryScope } from "@/lib/queue/clientMemory";
import { processHitlResumeFromEscalation } from "@/lib/hitl/resume";
import { maybeEnqueueOnlineJudgeSample } from "@/lib/evals/enqueue-online-judge";
import type {
  AgentJobPayload,
  HitlResumeJobPayload,
  HitlTimeoutJobPayload,
  PriorityJobPayload,
  SimulationJobPayload,
} from "./jobs";
import {
  AGENT_JOB_COMPLETED_OUTCOME,
  AGENT_JOB_SKIPPED_OUTCOME,
  agentJobSchema,
  demoDateKey,
  hitlResumeJobSchema,
  hitlTimeoutJobSchema,
  isHitlQueueJob,
} from "./jobs";

import { connection } from "./client";
import { emitAgentRunComplete } from "@/lib/events/emit";
import {
  recordJobCompleted,
  recordJobFailed,
  type QueueName,
} from "@/lib/queue/metrics";
import { buildJobTracingContext } from "@/lib/observability/mastra-tracing";

/**
 * Builds the initial context prompt for an agent run, describing what
 * triggered the run and any specific document context.
 * Document body text is loaded via VaultService (client-scoped) and sanitized first.
 */
async function buildInitialPrompt(
  payload: AgentJobPayload,
  vault: VaultService,
): Promise<string> {
  const parts = [
    `You are running for client ${payload.clientId}.`,
    `This run was triggered by: ${payload.trigger}.`,
  ];

  if (payload.trigger === "EVENT_UPLOAD" && payload.documentId) {
    parts.push(
      `A new document was just uploaded: ${payload.documentId}. ` +
        `Handle this document event first, then proceed with your normal observation and decision flow.`,
    );
    try {
      const content = await vault.getDocumentContentForAgent(payload.documentId);
      parts.push(content.agentContextBlock);
    } catch (error) {
      console.error(
        `[Worker] Failed to load document content for ${payload.documentId}:`,
        error instanceof Error ? error.message : error,
      );
      parts.push(
        `Document content was unavailable for ${payload.documentId}; use observation tools only.`,
      );
    }
  } else if (
    payload.trigger === "EVENT_EXPIRY_PROXIMITY" &&
    payload.documentId
  ) {
    parts.push(
      `Document ${payload.documentId} is inside the expiry-proximity window relative to DEMO_DATE. ` +
        `Prioritize renewal / reminder decisions for this document, then complete your normal observation flow.`,
    );
  } else if (payload.trigger === "EVENT_RISK_TIER_CHANGE") {
    parts.push(
      `Client risk tier changed (eventKey=${payload.eventKey ?? "unknown"}). ` +
        `Re-evaluate compliance obligations for the new risk tier.`,
    );
  } else if (payload.trigger === "EVENT_PROFILE_MATERIAL_CHANGE") {
    parts.push(
      `Material profile fields changed (eventKey=${payload.eventKey ?? "unknown"}). ` +
        `Re-check KYC completeness and any documents impacted by the change.`,
    );
  } else if (payload.trigger === "EVENT_SANCTIONS_PEP") {
    parts.push(
      `Sanctions/PEP stub signal received (eventKey=${payload.eventKey ?? "unknown"}). ` +
        `Call checkSanctionsStatus for the adapter seam result; do not invent vendor data ` +
        `or clearance — escalate if evidence is thin.`,
    );
  } else {
    parts.push(
      `Start by calling your observation tools to understand the current state of this client's vault.`,
    );
  }

  return parts.join("\n\n");
}

/**
 * Resolves the control-plane stage for tracing tags (onboarding SoR, else client profile stage).
 */
async function resolveRunStage(vault: VaultService): Promise<number> {
  const stageState = await vault.getOnboardingStageState();
  if (
    stageState &&
    typeof stageState === "object" &&
    "stage" in stageState &&
    typeof (stageState as { stage: unknown }).stage === "number"
  ) {
    return (stageState as { stage: number }).stage;
  }
  const profile = (await vault.getClientProfile()) as {
    onboardingStage?: number;
  };
  return typeof profile.onboardingStage === "number"
    ? profile.onboardingStage
    : 0;
}

/**
 * Extracts tool names from a Mastra generate result when present.
 */
function extractToolNames(result: unknown): string[] {
  if (!result || typeof result !== "object") return [];
  const toolCalls = (result as { toolCalls?: unknown }).toolCalls;
  if (!Array.isArray(toolCalls)) return [];
  const names: string[] = [];
  for (const call of toolCalls) {
    if (!call || typeof call !== "object") continue;
    const payload = call as { payload?: { toolName?: string }; toolName?: string; name?: string };
    const name =
      payload.payload?.toolName ?? payload.toolName ?? payload.name;
    if (typeof name === "string" && name.length > 0) {
      names.push(name);
    }
  }
  return names;
}

/**
 * Processes HITL resume or timeout jobs for durable advisor approvals.
 */
export async function processHitlJob(
  job: Job<HitlResumeJobPayload | HitlTimeoutJobPayload>,
) {
  const kind = (job.data as { kind?: string }).kind;
  if (kind === "hitl_timeout") {
    const parsed = hitlTimeoutJobSchema.parse(job.data);
    console.log(
      `[Worker] HITL timeout job ${job.id} for client ${parsed.clientId} run=${parsed.workflowRunId}`,
    );
    const vault = new VaultService({ clientId: parsed.clientId });
    const result = await processHitlResumeFromEscalation({
      vault,
      clientId: parsed.clientId,
      openKey: parsed.openKey,
      decision: "timeout",
    });
    return { success: true, ...result };
  }

  const parsed = hitlResumeJobSchema.parse(job.data);
  console.log(
    `[Worker] HITL resume job ${job.id} decision=${parsed.decision} client=${parsed.clientId}`,
  );
  const vault = new VaultService({ clientId: parsed.clientId });
  const result = await processHitlResumeFromEscalation({
    vault,
    clientId: parsed.clientId,
    openKey: parsed.openKey,
    decision: parsed.decision,
    editedReasoning: parsed.editedReasoning,
    advisorId: parsed.advisorId,
  });
  return { success: true, ...result };
}

/**
 * Priority queue processor: routes HITL resume/timeout vs agent runs.
 */
async function processPriorityJob(job: Job<PriorityJobPayload>) {
  if (isHitlQueueJob(job.data)) {
    return processHitlJob(
      job as Job<HitlResumeJobPayload | HitlTimeoutJobPayload>,
    );
  }
  return processAgentJob(job as Job<AgentJobPayload>);
}

/**
 * Processes an agent job: instantiates VaultService, builds scoped tools,
 * fetches the correct agent, and runs it with proper memory scoping + AI Tracing tags.
 * Skips re-execution when a successful completion marker already exists for this
 * logical job (queue jobId dedupe + processor-level idempotency).
 * Approve-class tools suspend via HITL workflow — this job completes without blocking.
 */
export async function processAgentJob(job: Job<AgentJobPayload>) {
  const parsed = agentJobSchema.parse(job.data);
  const { clientId, agentType, trigger, documentId } = parsed;
  const jobId = String(job.id ?? `unknown-${clientId}-${trigger}`);

  console.log(
    `[Worker] Processing ${agentType} job ${jobId} for client ${clientId} (trigger: ${trigger})`
  );

  // 1. Build VaultService scoped to this client
  const vault = new VaultService({ clientId });

  // Skip if this logical job already completed successfully (replay / leftover retention miss).
  const since = new Date(`${demoDateKey()}T00:00:00.000Z`);
  const alreadyDone = await vault.hasCompletedAgentJob({
    agentType,
    trigger,
    documentId,
    completedOutcome: AGENT_JOB_COMPLETED_OUTCOME,
    since,
  });

  if (alreadyDone) {
    console.log(
      `[Worker] Skipping ${agentType} job ${job.id} for client ${clientId} — already completed`
    );
    try {
      await vault.logAction({
        documentId,
        agentType,
        actionType: "SCAN_VAULT",
        trigger,
        reasoning: `Idempotent skip: prior AGENT_RUN_COMPLETED exists for job ${String(job.id ?? "unknown")}`,
        outcome: AGENT_JOB_SKIPPED_OUTCOME,
      });
    } catch (logError) {
      console.error(
        `[Worker] Failed to log idempotent skip for job ${job.id}:`,
        logError
      );
    }

    try {
      await emitAgentRunComplete({
        clientId,
        agentType,
        jobId: String(job.id ?? "unknown"),
        success: true,
      });
    } catch (emitErr) {
      console.error("[Worker] emitAgentRunComplete failed:", emitErr);
    }

    return { success: true, skipped: true };
  }

  // 2. Build tools — shared + agent-specific, grouped for Mastra toolsets
  const sharedTools = buildSharedTools(vault, { agentType });

  const agentName =
    agentType === "COMPLIANCE" ? "complianceAgent" : "onboardingAgent";
  const cerebro = await getCerebro();
  const agent = cerebro.getAgent(agentName);

  const agentSpecificTools =
    agentType === "COMPLIANCE"
      ? buildComplianceTools(vault)
      : buildOnboardingTools(vault);

  const domain = agentType === "COMPLIANCE" ? "compliance" : "onboarding";
  assertAgentToolAllowlist(domain, [
    ...Object.keys(sharedTools),
    ...Object.keys(agentSpecificTools),
  ]);

  // Mastra expects toolsets as Record<string, Record<string, Tool>>
  const toolsets = {
    shared: sharedTools,
    ...(agentType === "COMPLIANCE"
      ? { compliance: agentSpecificTools }
      : { onboarding: agentSpecificTools }),
  };

  const stage = await resolveRunStage(vault);
  const { requestContext, tracingOptions, traceId, contentCaptured } =
    buildJobTracingContext({
      clientId,
      agentName,
      stage,
      jobId,
    });

  // Examiner SoR: job start is reconstructible from Postgres without model logs.
  await vault.logDecision({
    jobId,
    agentName,
    stage,
    traceId,
    outcome: "RUN_STARTED",
    reason: `Agent run started (trigger=${trigger})`,
    contentCaptured,
    metadata: { trigger, dryRun: env.DRY_RUN },
  });

  // 3. Run the agent with scoped memory + one logical trace per job
  const prompt = await buildInitialPrompt(parsed, vault);
  const memory = buildClientMemoryScope(clientId);

  try {
    const result = await agent.generate(prompt, {
      memory,
      toolsets,
      requestContext,
      tracingOptions,
      maxSteps: getAgentMaxSteps(),
    });

    const tools = extractToolNames(result);

    await vault.logDecision({
      jobId,
      agentName,
      stage,
      traceId,
      toolProposed: tools,
      toolExecuted: tools,
      outcome: env.DRY_RUN ? "DRY_RUN" : "RUN_SUCCEEDED",
      reason: env.DRY_RUN
        ? "Agent run completed under DRY_RUN (externals suppressed)"
        : "Agent run completed successfully",
      contentCaptured,
      metadata: { trigger, textLength: result.text?.length ?? 0 },
    });

    console.log(
      `[Worker] ${agentType} job ${jobId} completed for client ${clientId}`
    );

    try {
      await vault.logAction({
        documentId,
        agentType,
        actionType: "SCAN_VAULT",
        trigger,
        reasoning: `Agent run completed successfully for job ${String(job.id ?? "unknown")}`,
        outcome: AGENT_JOB_COMPLETED_OUTCOME,
        nextScheduledAt: new Date(
          new Date(env.DEMO_DATE).getTime() + 1 * 24 * 60 * 60 * 1000
        ),
      });
    } catch (logError) {
      console.error(
        `[Worker] Failed to log completion for job ${job.id}:`,
        logError
      );
    }

    try {
      await emitAgentRunComplete({
        clientId,
        agentType,
        jobId,
        success: true,
      });
    } catch (emitErr) {
      console.error("[Worker] emitAgentRunComplete failed:", emitErr);
    }

    // Cheap-eval PR5: dual-stream online sample (uniform ≤5%; never blocks; DRY_RUN-safe).
    void maybeEnqueueOnlineJudgeSample({
      clientId,
      agentType,
      sourceJobId: jobId,
      traceId,
      agentName,
      stage,
      reasoningText: typeof result.text === "string" ? result.text : "",
      toolNames: tools,
      isFailureSignal: false,
    });

    return { success: true, text: result.text, traceId };
  } catch (error) {
    // Always log failure to audit trail so the dashboard can see it
    try {
      await vault.logDecision({
        jobId,
        agentName,
        stage,
        traceId,
        outcome: "RUN_FAILED",
        refusalCodes: ["AGENT_RUN_FAILED"],
        reason: `Agent run failed: ${error instanceof Error ? error.message : String(error)}`,
        contentCaptured,
        metadata: { trigger },
      });
      await vault.logAction({
        documentId,
        agentType,
        actionType: "SCAN_VAULT",
        trigger,
        reasoning: `Agent run failed with error: ${error instanceof Error ? error.message : String(error)}`,
        outcome: "AGENT_RUN_FAILED",
        nextScheduledAt: new Date(
          new Date(env.DEMO_DATE).getTime() + 1 * 24 * 60 * 60 * 1000
        ),
      });
    } catch (logError) {
      console.error(
        `[Worker] Failed to log audit trail for failed job ${jobId}:`,
        logError
      );
    }

    // Failure-weighted stream → promote queue (async; never the ship gate).
    void maybeEnqueueOnlineJudgeSample({
      clientId,
      agentType,
      sourceJobId: jobId,
      traceId,
      agentName,
      stage,
      reasoningText: error instanceof Error ? error.message : String(error),
      toolNames: [],
      isFailureSignal: true,
    });

    // Re-throw so BullMQ handles retries
    throw error;
  }
}

import { SimulationOrchestrator } from "@/lib/simulation/orchestrator";

/**
 * Processes a simulation batch job.
 * Each batch represents a set of days to process for all clients in the simulation.
 */
export async function processSimulationJob(job: Job<SimulationJobPayload>) {
  const { runId, batchStart, batchEnd, clientStart, clientEnd } = job.data;
  const startTime = Date.now();
  
  console.log(
    `[Worker] Processing simulation batch days ${batchStart}-${batchEnd} for run ${runId}` +
    (clientStart !== undefined ? ` (clients ${clientStart}-${clientEnd})` : "")
  );

  const orchestrator = new SimulationOrchestrator();
  const clientRange = (clientStart !== undefined && clientEnd !== undefined) 
    ? { start: clientStart, end: clientEnd } 
    : undefined;

  try {
    const totalDays = batchEnd - batchStart + 1;
    
    for (let day = batchStart; day <= batchEnd; day++) {
      await orchestrator.tick(runId, day, clientRange);
      
      // Log memory and throughput at intervals
      const elapsedSec = (Date.now() - startTime) / 1000;
      const daysProcessed = day - batchStart + 1;
      const throughput = (daysProcessed / elapsedSec).toFixed(2);
      
      if (daysProcessed % Math.max(1, Math.floor(totalDays / 10)) === 0) {
        const memUsage = process.memoryUsage().heapUsed / 1024 / 1024;
        console.log(`[Worker] Run ${runId} Progress: ${daysProcessed}/${totalDays} days | Throughput: ${throughput} days/sec | Memory: ${memUsage.toFixed(2)} MB`);
      }
    }
    
    // Update progress ONLY after the entire batch is finished
    await orchestrator.incrementProgress(runId);

    const totalElapsed = (Date.now() - startTime) / 1000;
    console.log(`[Worker] Simulation batch ${batchStart}-${batchEnd} completed for run ${runId} in ${totalElapsed.toFixed(2)}s`);
    
    // Aggregating metrics after batch completion ensures the dashboard shows fresh action counts
    await orchestrator.aggregateMetrics(runId);
    
    return { success: true, duration: totalElapsed };
  } catch (error) {
    console.error(`[Worker] Simulation job ${job.id} failed:`, error);
    throw error;
  }
}

type WorkerBundle = {
  priority: Worker<PriorityJobPayload>;
  scheduled: Worker<AgentJobPayload>;
  simulation: Worker<SimulationJobPayload>;
};

const isVitest = process.env.VITEST === "true";

// Workers with concurrency limits per database.mdc §Worker Concurrency.
// Skip construction under Vitest so importing `processSimulationJob` does not open Redis connections.
export const workers: WorkerBundle = isVitest
  ? ({} as WorkerBundle)
  : {
      priority: new Worker<PriorityJobPayload>(
        "cerebro-priority",
        processPriorityJob,
        {
          connection: connection as never,
          concurrency: 5,
        }
      ),
      scheduled: new Worker<AgentJobPayload>(
        "cerebro-scheduled",
        processAgentJob,
        {
          connection: connection as never,
          concurrency: 3,
        }
      ),
      simulation: new Worker<SimulationJobPayload>(
        "cerebro-simulation",
        processSimulationJob,
        {
          connection: connection as never,
          concurrency: 20,
          limiter: {
            max: 50,
            duration: 1000,
          },
        }
      ),
    };

// Generic error/completion logging + metrics for all workers
if (!isVitest) {
  Object.values(workers).forEach((worker) => {
    const queueName = worker.name as QueueName;
    console.log(`[Worker] Initialized queue: ${worker.name}`);
    worker.on("completed", (job) => {
      recordJobCompleted(queueName);
      console.log(
        `[Worker - ${worker.name}] Job ${job.id} completed successfully`
      );
    });
    worker.on("failed", (job, err) => {
      recordJobFailed(queueName);
      console.error(`[Worker - ${worker.name}] Job ${job?.id} failed:`, err);
    });
  });
}
