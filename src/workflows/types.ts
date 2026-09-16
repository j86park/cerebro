import { z } from "zod";

const agentIdSchema = z.preprocess(
  (v) => (typeof v === "string" ? v.trim().toLowerCase() : v),
  z.enum(["compliance", "onboarding"])
);

export const failureTypeSchema = z.enum([
  "tool_selection",
  "reasoning_truncation",
  "context_misinterpretation",
  "over_hedging",
  "format_noncompliance",
]);

export type FailureType = z.infer<typeof failureTypeSchema>;

/**
 * One taxonomy finding — must cite failing scorer + evidence (WP-P1.6 quality bars).
 */
export const failureFindingSchema = z.object({
  scenarioId: z.string().min(1),
  agentId: agentIdSchema,
  failureType: failureTypeSchema,
  triggerPattern: z.string().min(1),
  /** Soft narrative from the scorer / judge. */
  scorerReasoning: z.string().min(1),
  /** Hard cite: which scorer id failed (e.g. escalationStageScorer). */
  failingScorerId: z.string().min(1),
  /** Hard cite: concrete evidence span from trajectory / DB / tool path. */
  evidenceSpan: z.string().min(8),
  proposedInstruction: z.string().min(1),
});

export type FailureFinding = z.infer<typeof failureFindingSchema>;

export const taxonomyReportSchema = z.object({
  agentId: agentIdSchema,
  evalRunId: z.string(),
  findings: z.array(failureFindingSchema),
  dominantFailureType: failureTypeSchema,
  recommendedMutation: z.string().min(1),
});

export type TaxonomyReport = z.infer<typeof taxonomyReportSchema>;
