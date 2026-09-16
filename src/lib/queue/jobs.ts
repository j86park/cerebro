import { z } from "zod";
import {
  hitlResumeJobSchema,
  hitlTimeoutJobSchema,
  buildHitlResumeJobId,
  buildHitlTimeoutJobId,
  type HitlResumeJobPayload,
  type HitlTimeoutJobPayload,
} from "@/lib/hitl/schemas";

/**
 * Payload for all live agent jobs (priority + scheduled queues).
 * Validated with Zod before every enqueue.
 */
export const agentJobSchema = z.object({
  clientId: z.string().min(1),
  agentType: z.enum(["COMPLIANCE", "ONBOARDING"]),
  trigger: z.enum(["SCHEDULED", "EVENT_UPLOAD", "MANUAL"]),
  documentId: z.string().optional(),
});

export type AgentJobPayload = z.infer<typeof agentJobSchema>;

/**
 * Payload for simulation batch jobs (simulation queue only).
 */
export const simulationJobSchema = z.object({
  runId: z.string().min(1),
  batchStart: z.number().int().nonnegative(),
  batchEnd: z.number().int().nonnegative(),
  clientStart: z.number().int().nonnegative().optional(),
  clientEnd: z.number().int().nonnegative().optional(),
});

export type SimulationJobPayload = z.infer<typeof simulationJobSchema>;

export {
  hitlResumeJobSchema,
  hitlTimeoutJobSchema,
  buildHitlResumeJobId,
  buildHitlTimeoutJobId,
};
export type { HitlResumeJobPayload, HitlTimeoutJobPayload };

/** Priority-queue payloads: agent runs or HITL resume/timeout. */
export const priorityJobSchema = z.union([
  agentJobSchema,
  hitlResumeJobSchema,
  hitlTimeoutJobSchema,
]);

export type PriorityJobPayload = z.infer<typeof priorityJobSchema>;

/**
 * Returns true when a priority-queue payload is a HITL resume or timeout job.
 */
export function isHitlQueueJob(
  data: unknown,
): data is HitlResumeJobPayload | HitlTimeoutJobPayload {
  if (!data || typeof data !== "object") return false;
  const kind = (data as { kind?: unknown }).kind;
  return kind === "hitl_resume" || kind === "hitl_timeout";
}
