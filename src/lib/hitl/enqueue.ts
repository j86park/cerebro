import type { JobsOptions, Queue } from "bullmq";
import { env } from "@/lib/config";
import {
  buildHitlResumeJobId,
  buildHitlTimeoutJobId,
  hitlResumeJobSchema,
  hitlTimeoutJobSchema,
  type HitlResumeJobPayload,
  type HitlTimeoutJobPayload,
} from "./schemas";

type QueueLike = {
  add: (
    name: string,
    data: HitlResumeJobPayload | HitlTimeoutJobPayload,
    opts?: JobsOptions,
  ) => Promise<{ id?: string }>;
  getJob?: (jobId: string) => Promise<{ id?: string } | null | undefined>;
};

export type EnqueueHitlResult = {
  jobId: string;
  deduplicated: boolean;
};

/**
 * Enqueues a HITL resume job onto the priority queue with a deterministic jobId.
 */
export async function enqueueHitlResumeJob(
  queue: QueueLike | Queue,
  payload: HitlResumeJobPayload,
  options?: Omit<JobsOptions, "jobId">,
): Promise<EnqueueHitlResult> {
  const parsed = hitlResumeJobSchema.parse(payload);
  const jobId = buildHitlResumeJobId(parsed);

  if (typeof (queue as QueueLike).getJob === "function") {
    const existing = await (queue as QueueLike).getJob?.(jobId);
    if (existing) {
      return { jobId, deduplicated: true };
    }
  }

  const job = await queue.add(`hitl-resume-${parsed.decision}`, parsed, {
    ...options,
    jobId,
  });
  return { jobId: String(job.id ?? jobId), deduplicated: false };
}

/**
 * Enqueues a delayed HITL timeout job that resumes with SAFE_HOLD (never auto-approve).
 */
export async function enqueueHitlTimeoutJob(
  queue: QueueLike | Queue,
  payload: HitlTimeoutJobPayload,
  options?: Omit<JobsOptions, "jobId" | "delay">,
): Promise<EnqueueHitlResult> {
  const parsed = hitlTimeoutJobSchema.parse(payload);
  const jobId = buildHitlTimeoutJobId(parsed.workflowRunId);

  if (typeof (queue as QueueLike).getJob === "function") {
    const existing = await (queue as QueueLike).getJob?.(jobId);
    if (existing) {
      return { jobId, deduplicated: true };
    }
  }

  const job = await queue.add("hitl-timeout", parsed, {
    ...options,
    jobId,
    delay: env.HITL_APPROVAL_TIMEOUT_MS,
  });
  return { jobId: String(job.id ?? jobId), deduplicated: false };
}
