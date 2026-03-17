import { z } from "zod";

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
