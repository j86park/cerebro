import type { JobsOptions, Queue } from "bullmq";
import {
  agentJobRetentionOptions,
  agentJobSchema,
  buildAgentJobId,
  isDuplicateJobIdError,
  type AgentJobPayload,
} from "@/lib/queue/jobs";

export type EnqueueAgentJobResult = {
  jobId: string;
  deduplicated: boolean;
};

type QueueWithGetJob = Queue<AgentJobPayload> & {
  getJob?: (jobId: string) => Promise<{ id?: string } | null | undefined>;
};

/**
 * Validates payload, assigns a deterministic jobId, and enqueues onto the given queue.
 * If a job with the same id already exists in Redis (waiting/active/completed retention),
 * returns deduplicated: true without creating a new runnable job.
 * BullMQ's add() is also safe under races (duplicate jobIds are no-ops at the Lua layer).
 */
export async function enqueueAgentJob(
  queue: QueueWithGetJob,
  payload: AgentJobPayload,
  options?: Omit<JobsOptions, "jobId">
): Promise<EnqueueAgentJobResult> {
  const parsed = agentJobSchema.parse(payload);
  const jobId = buildAgentJobId(parsed);
  const name = `${parsed.trigger.toLowerCase()}-${parsed.agentType}-${parsed.clientId}`;

  if (typeof queue.getJob === "function") {
    const existing = await queue.getJob(jobId);
    if (existing) {
      return { jobId, deduplicated: true };
    }
  }

  try {
    const job = await queue.add(name, parsed, {
      ...agentJobRetentionOptions,
      ...options,
      jobId,
    });
    return { jobId: String(job.id ?? jobId), deduplicated: false };
  } catch (error) {
    // Older BullMQ builds / edge cases may still throw on collision.
    if (isDuplicateJobIdError(error)) {
      return { jobId, deduplicated: true };
    }
    throw error;
  }
}
