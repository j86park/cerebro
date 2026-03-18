import { Worker, Job } from "bullmq";
import Redis from "ioredis";
import { env } from "@/lib/config";
import { cerebro } from "@/agents/mastra";
import { VaultService } from "@/lib/db/vault-service";
import { buildComplianceTools } from "@/tools/compliance";
import { buildOnboardingTools } from "@/tools/onboarding";
import { buildSharedTools } from "@/tools/shared";
import type { AgentJobPayload, SimulationJobPayload } from "./jobs";
import { agentJobSchema } from "./jobs";

// BullMQ requires maxRetriesPerRequest to be null
const connection = new Redis(env.UPSTASH_REDIS_URL, {
  maxRetriesPerRequest: null,
  tls: { rejectUnauthorized: false },
});

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
 * Processes an agent job: instantiates VaultService, builds scoped tools,
 * fetches the correct agent, and runs it with proper memory scoping.
 */
async function processAgentJob(job: Job<AgentJobPayload>) {
  const parsed = agentJobSchema.parse(job.data);
  const { clientId, agentType, trigger } = parsed;

  console.log(
    `[Worker] Processing ${agentType} job ${job.id} for client ${clientId} (trigger: ${trigger})`
  );

  // 1. Build VaultService scoped to this client
  const vault = new VaultService({ clientId });

  // 2. Build tools — shared + agent-specific, grouped for Mastra toolsets
  const sharedTools = buildSharedTools(vault);

  const agentName =
    agentType === "COMPLIANCE" ? "complianceAgent" : "onboardingAgent";
  const agent = cerebro.getAgent(agentName);

  const agentSpecificTools =
    agentType === "COMPLIANCE"
      ? buildComplianceTools(vault)
      : buildOnboardingTools(vault);

  // Mastra expects toolsets as Record<string, Record<string, Tool>>
  const toolsets = {
    shared: sharedTools,
    ...(agentType === "COMPLIANCE"
      ? { compliance: agentSpecificTools }
      : { onboarding: agentSpecificTools }),
  };

  // 3. Run the agent with scoped memory
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
    return { success: true, text: result.text };
  } catch (error) {
    // Always log failure to audit trail so the dashboard can see it
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
      
      // Update progress after each day in the batch
      await orchestrator.updateProgress(runId, {
        batchesCompleted: day + 1,
        batchesTotal: (await orchestrator.getRun(runId))?.simulatedDays || day + 1,
      });

      // Log memory and throughput at intervals
      const elapsedSec = (Date.now() - startTime) / 1000;
      const daysProcessed = day - batchStart + 1;
      const throughput = (daysProcessed / elapsedSec).toFixed(2);
      
      if (daysProcessed % Math.max(1, Math.floor(totalDays / 10)) === 0) {
        const memUsage = process.memoryUsage().heapUsed / 1024 / 1024;
        console.log(`[Worker] Run ${runId} Progress: ${daysProcessed}/${totalDays} days | Throughput: ${throughput} days/sec | Memory: ${memUsage.toFixed(2)} MB`);
      }
    }

    const totalElapsed = (Date.now() - startTime) / 1000;
    console.log(`[Worker] Simulation batch ${batchStart}-${batchEnd} completed for run ${runId} in ${totalElapsed.toFixed(2)}s`);
    return { success: true, duration: totalElapsed };
  } catch (error) {
    console.error(`[Worker] Simulation job ${job.id} failed:`, error);
    throw error;
  }
}

// Workers with concurrency limits per database.mdc §Worker Concurrency
export const workers = {
  priority: new Worker<AgentJobPayload>(
    "cerebro-priority",
    processAgentJob,
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

// Generic error/completion logging for all workers
Object.values(workers).forEach((worker) => {
  worker.on("completed", (job) => {
    console.log(`[Worker - ${worker.name}] Job ${job.id} completed successfully`);
  });
  worker.on("failed", (job, err) => {
    console.error(`[Worker - ${worker.name}] Job ${job?.id} failed:`, err);
  });
});
