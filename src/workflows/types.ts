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

export const failureFindingSchema = z.object({
  scenarioId: z.string(),
  agentId: agentIdSchema,
  failureType: failureTypeSchema,
  triggerPattern: z.string(),
  scorerReasoning: z.string(),
  proposedInstruction: z.string(),
});

export type FailureFinding = z.infer<typeof failureFindingSchema>;

export const taxonomyReportSchema = z.object({
  agentId: agentIdSchema,
  evalRunId: z.string(),
  findings: z.array(failureFindingSchema),
  dominantFailureType: failureTypeSchema,
  recommendedMutation: z.string(),
});

export type TaxonomyReport = z.infer<typeof taxonomyReportSchema>;
