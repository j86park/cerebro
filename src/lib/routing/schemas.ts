import { z } from "zod";

/**
 * Complexity heuristic inputs for hybrid MAS↔SAS cost cascade (SOTA P2.7 watch).
 * Deterministic — no LLM; does not replace the tool policy matrix.
 */
export const cascadeComplexityInputSchema = z.object({
  /** BullMQ / event trigger name (e.g. scan, upload, expiry_proximity). */
  trigger: z.string().min(1),
  documentCount: z.number().int().min(0),
  /** Open escalations already pending for this client. */
  openEscalationCount: z.number().int().min(0).default(0),
  /** Prior hard-gate fail in this job wave. */
  priorHardFail: z.boolean().default(false),
});

export type CascadeComplexityInput = z.input<
  typeof cascadeComplexityInputSchema
>;

export const cascadeComplexitySchema = z.enum(["low", "medium", "high"]);

export type CascadeComplexity = z.infer<typeof cascadeComplexitySchema>;

export const cascadeExecutionModeSchema = z.enum([
  "sas_single",
  "mas_specialists",
  "escalate_human",
]);

export type CascadeExecutionMode = z.infer<typeof cascadeExecutionModeSchema>;

export const cascadeDecisionSchema = z.object({
  mode: cascadeExecutionModeSchema,
  complexity: cascadeComplexitySchema,
  reason: z.string().min(1),
  budgetUsdRemaining: z.number().min(0),
});

export type CascadeDecision = z.infer<typeof cascadeDecisionSchema>;

/**
 * Maps trigger + doc pressure to a coarse complexity band.
 */
export function estimateCascadeComplexity(
  input: CascadeComplexityInput,
): CascadeComplexity {
  const parsed = cascadeComplexityInputSchema.parse(input);

  if (parsed.priorHardFail || parsed.openEscalationCount >= 2) {
    return "high";
  }

  const multiDoc = parsed.documentCount >= 5;
  const eventful =
    /expiry|risk_tier|profile|sanctions|pep/i.test(parsed.trigger) ||
    parsed.documentCount >= 3;

  if (multiDoc || (eventful && parsed.documentCount >= 2)) {
    return "medium";
  }

  return "low";
}
