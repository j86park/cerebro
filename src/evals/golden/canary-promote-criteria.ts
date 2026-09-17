import { z } from "zod";

/**
 * Documented criteria for promoting an approved golden into the hard-gate canary set.
 * REGULATORY: never unsupervised — human approve + regulatoryConfirmed required upstream.
 */
export const canaryPromoteCriteriaSchema = z.object({
  /** Scenario must be marked canary after human review. */
  canary: z.literal(true),
  /** Human must confirm REGULATORY expectations before ship-gate membership. */
  regulatoryConfirmed: z.literal(true),
  /** Explicit human approve flag (API / CLI). */
  humanApproved: z.literal(true),
  /**
   * Soft LLM judge may advise but never overrides hard canary membership.
   * Abstention / fail = do not use soft judge as promote signal.
   */
  softJudgeIsNotShipGate: z.literal(true),
  /**
   * Online dual-stream sample is promote-queue fuel only — never the primary ship gate.
   */
  onlineSampleIsNotShipGate: z.literal(true),
});

export type CanaryPromoteCriteria = z.infer<typeof canaryPromoteCriteriaSchema>;

/**
 * Static checklist for operators / UX — approved canaries enter hard-gate set
 * only when all of these hold (enforced by promoteGoldenToApproved + loader).
 */
export const CANARY_PROMOTE_CRITERIA: CanaryPromoteCriteria = {
  canary: true,
  regulatoryConfirmed: true,
  humanApproved: true,
  softJudgeIsNotShipGate: true,
  onlineSampleIsNotShipGate: true,
};

const eligibilityInputSchema = z.object({
  canary: z.boolean(),
  regulatoryConfirmed: z.boolean(),
  humanApproved: z.boolean(),
});

export type CanaryPromoteEligibilityInput = z.infer<
  typeof eligibilityInputSchema
>;

/**
 * Returns whether a golden may join the hard canary set (clientId union).
 * Soft/online judges are never consulted here.
 */
export function isEligibleForCanaryHardGate(
  input: CanaryPromoteEligibilityInput,
): boolean {
  const parsed = eligibilityInputSchema.parse(input);
  return (
    parsed.canary === true &&
    parsed.regulatoryConfirmed === true &&
    parsed.humanApproved === true
  );
}
