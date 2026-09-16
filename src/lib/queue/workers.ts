import { Worker, Job } from "bullmq";
import { env } from "@/lib/config";
import { getCerebro } from "@/agents/mastra";
import "@/workers/mutation-analysis.worker";
import "@/workers/shadow-runner.worker";
import { VaultService } from "@/lib/db/vault-service";
import { buildComplianceTools } from "@/tools/compliance";
import { buildOnboardingTools } from "@/tools/onboarding";
import { buildSharedTools } from "@/tools/shared";
import type {
  AgentJobPayload,
  HitlResumeJobPayload,
  HitlTimeoutJobPayload,
  PriorityJobPayload,
  SimulationJobPayload,
} from "./jobs";
import {
  agentJobSchema,
  hitlResumeJobSchema,
  hitlTimeoutJobSchema,
  isHitlQueueJob,
} from "./jobs";
import { processHitlResumeFromEscalation } from "@/lib/hitl/resume";

import { connection } from "./client";
import { emitAgentRunComplete } from "@/lib/events/emit";
import {
  recordJobCompleted,
  recordJobFailed,
  type QueueName,
} from "@/lib/queue/metrics";

/**
 * Builds the initial context prompt for an agent run, describing what
 * triggered the run and any specific document context.
 */
function buildInitialPrompt(payload: AgentJobPayload): string {
  const parts = [
    `You are running for client ${payload.clientId}.`,
    `This run was triggered by: ${payload.trigger}.`,
  ];

  if (payload.trigger === "EVENT_UPLOAD" && payload.documentId) {
    parts.push(
      `A new document was just uploaded: ${payload.documentId}. ` +
        `Handle this document event first, then proceed with your normal observation and decision flow.`
    );
  } else {
    parts.push(
      `Start by calling your observation tools to understand the current state of this client's vault.`
    );
  }

  return parts.join(" ");
}

/**
 * Processes HITL resume/timeout jobs: resumes Mastra snapshot without holding a wait loop.
 * REGULATORY: timeout maps to SAFE_HOLD — never silent regulated auto-approve.
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
 * Processes an agent job: instantiates VaultService, builds scoped tools,
 * fetches the correct agent, and runs it with proper memory scoping.
 * Approve-class tools suspend via HITL workflow — this job completes without blocking.
 */
async function processAgentJob(job: Job<AgentJobPayload>) {
  const parsed = agentJobSchema.parse(job.data);
  const { clientId, agentType, trigger } = parsed;

  console.log(
    `[Worker] Processing ${agentType} job ${job.id} for client ${clientId} (trigger: ${trigger})`
  );

  const vault = new VaultService({ clientId });
  const sharedTools = buildSharedTools(vault);

  const agentName =
    agentType === "COMPLIANCE" ? "complianceAgent" : "onboardingAgent";
  const cerebro = await getCerebro();
  const agent = cerebro.getAgent(agentName);

  const agentSpecificTools =
    agentType === "COMPLIANCE"
      ? buildComplianceTools(vault)
      : buildOnboardingTools(vault);

  const toolsets = {
    shared: sharedTools,
    ...(agentType === "COMPLIANCE"
      ? { compliance: agentSpecificTools }
      : { onboarding: agentSpecificTools }),
  };

  const prompt = buildInitialPrompt(parsed);

  try {
    const result = await agent.generate(prompt, {
      memory: {
        resource: clientId,
        thread: clientId,
      },
      toolsets,
    });

    console.log(
      `[Worker] ${agentType} job ${job.id} completed for client ${clientId}`
    );

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

    return { success: true, text: result.text };
  } catch (error) {
    try {
      await vault.logAction({
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
        `[Worker] Failed to log audit trail for failed job ${job.id}:`,
        logError
      );
    }

    throw error;
  }
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

import { SimulationOrchestrator } from "@/lib/simulation/orchestrator";

/**
 * Processes a simulation batch job.
 */
export async function processSimulationJob(job: Job<SimulationJobPayload>) {
  const { runId, batchStart, batchEnd, clientStart, clientEnd } = job.data;
  const startTime = Date.now();

  console.log(
    `[Worker] Processing simulation batch days ${batchStart}-${batchEnd} for run ${runId}` +
      (clientStart !== undefined
        ? ` (clients ${clientStart}-${clientEnd})`
        : "")
  );

  const orchestrator = new SimulationOrchestrator();
  const clientRange =
    clientStart !== undefined && clientEnd !== undefined
      ? { start: clientStart, end: clientEnd }
      : undefined;

  try {
    const totalDays = batchEnd - batchStart + 1;

    for (let day = batchStart; day <= batchEnd; day++) {
      await orchestrator.tick(runId, day, clientRange);

      const elapsedSec = (Date.now() - startTime) / 1000;
      const daysProcessed = day - batchStart + 1;
      const throughput = (daysProcessed / elapsedSec).toFixed(2);

      if (daysProcessed % Math.max(1, Math.floor(totalDays / 10)) === 0) {
        const memUsage = process.memoryUsage().heapUsed / 1024 / 1024;
        console.log(
          `[Worker] Run ${runId} Progress: ${daysProcessed}/${totalDays} days | Throughput: ${throughput} days/sec | Memory: ${memUsage.toFixed(2)} MB`
        );
      }
    }

    await orchestrator.incrementProgress(runId);

    const totalElapsed = (Date.now() - startTime) / 1000;
    console.log(
      `[Worker] Simulation batch ${batchStart}-${batchEnd} completed for run ${runId} in ${totalElapsed.toFixed(2)}s`
    );

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
