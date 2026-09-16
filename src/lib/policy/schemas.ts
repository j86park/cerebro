import { z } from "zod";

/**
 * Decision mode for a stage × tool policy cell.
 * - auto: tool may execute side effects
 * - approve: ledger intent only; HITL required before side effects (WP-P0.3)
 * - block: deny; ledger evidence; no side effects
 */
export const policyModeSchema = z.enum(["auto", "approve", "block"]);

export type PolicyMode = z.infer<typeof policyModeSchema>;

export const policyDomainSchema = z.enum(["compliance", "onboarding"]);

export type PolicyDomain = z.infer<typeof policyDomainSchema>;

/**
 * Serializable policy rule (arg predicates are attached at runtime in matrix defaults).
 */
export const toolPolicyRuleSchema = z.object({
  domain: policyDomainSchema,
  stage: z.number().int().min(0),
  toolName: z.string().min(1),
  mode: policyModeSchema,
  /** Optional named predicate id; resolved by matrix runtime (deny-wins still applies). */
  argPredicateId: z.string().min(1).optional(),
});

export type ToolPolicyRule = z.infer<typeof toolPolicyRuleSchema> & {
  /**
   * Optional argument predicate. When present and returns false, the rule does not apply.
   * Not part of the Zod-serialized surface — attached in code config only.
   */
  when?: (args: Record<string, unknown>) => boolean;
};

export const toolPolicyMatrixSchema = z.object({
  version: z.string().min(1),
  rules: z.array(toolPolicyRuleSchema).min(1),
});

/** Runtime matrix: Zod-validated fields plus optional argument predicates. */
export type ToolPolicyMatrix = {
  version: string;
  rules: ToolPolicyRule[];
};

export const evaluateToolPolicyInputSchema = z.object({
  domain: policyDomainSchema,
  stage: z.number().int().min(0),
  toolName: z.string().min(1),
  args: z.record(z.unknown()).optional(),
});

export type EvaluateToolPolicyInput = z.infer<typeof evaluateToolPolicyInputSchema>;

export const toolPolicyDecisionSchema = z.object({
  mode: policyModeSchema,
  policyVersion: z.string().min(1),
  reasonCode: z.string().min(1),
  matchedRuleCount: z.number().int().min(0),
});

export type ToolPolicyDecision = z.infer<typeof toolPolicyDecisionSchema>;
