import { z } from "zod";

/**
 * Examiner-facing decision outcomes persisted in Postgres DecisionRecord.
 */
export const decisionOutcomeSchema = z.enum([
  "RUN_STARTED",
  "RUN_SUCCEEDED",
  "RUN_FAILED",
  "TOOL_PROPOSED",
  "TOOL_EXECUTED",
  "REFUSED",
  "PENDING_REVIEW",
  "DRY_RUN",
  /** Async online judge sample completed (WP-P1.7). */
  "ONLINE_JUDGED",
]);

export type DecisionOutcome = z.infer<typeof decisionOutcomeSchema>;

/**
 * Zod schema for VaultService decision-log writes (WP-P0.6).
 */
export const logDecisionInputSchema = z.object({
  jobId: z.string().min(1),
  agentName: z.string().min(1),
  stage: z.number().int().optional(),
  /** Shared Mastra/GenAI trace id for this job (1–32 hex chars). */
  traceId: z
    .string()
    .regex(/^[0-9a-f]{1,32}$/i, "traceId must be 1–32 hexadecimal characters"),
  policyVersion: z.string().optional(),
  policyFired: z.string().optional(),
  toolProposed: z.array(z.string().min(1)).optional(),
  toolExecuted: z.array(z.string().min(1)).optional(),
  refusalCodes: z.array(z.string().min(1)).optional(),
  reviewer: z.string().optional(),
  outcome: decisionOutcomeSchema,
  reason: z.string().min(1),
  promptVersionId: z.string().optional(),
  contentCaptured: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type LogDecisionInput = z.infer<typeof logDecisionInputSchema>;

/**
 * Shape returned when reconstructing a sample run from Postgres alone.
 */
export const decisionRecordViewSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  jobId: z.string(),
  agentName: z.string(),
  stage: z.number().nullable().optional(),
  traceId: z.string(),
  policyVersion: z.string().nullable().optional(),
  policyFired: z.string().nullable().optional(),
  toolProposed: z.array(z.string()),
  toolExecuted: z.array(z.string()),
  refusalCodes: z.array(z.string()),
  reviewer: z.string().nullable().optional(),
  outcome: z.string(),
  reason: z.string(),
  promptVersionId: z.string().nullable().optional(),
  contentCaptured: z.boolean(),
  metadata: z.unknown().optional(),
  decidedAt: z.coerce.date(),
});

export type DecisionRecordView = z.infer<typeof decisionRecordViewSchema>;
