import { env } from "@/lib/config";
import {
  evaluateToolPolicyInputSchema,
  toolPolicyDecisionSchema,
  toolPolicyMatrixSchema,
  type EvaluateToolPolicyInput,
  type ToolPolicyDecision,
  type ToolPolicyMatrix,
  type ToolPolicyRule,
} from "./schemas";

/**
 * Default stage × tool × mode matrix.
 * REGULATORY: stages 4–5 escalations require approve (never silent auto-send).
 * Unlisted cells default to block (deny-wins / fail-closed).
 */
const DEFAULT_RULES: ToolPolicyRule[] = [
  // Compliance ladder
  { domain: "compliance", stage: 1, toolName: "sendAdvisorAlert", mode: "auto" },
  { domain: "compliance", stage: 1, toolName: "sendClientReminder", mode: "block" },
  {
    domain: "compliance",
    stage: 1,
    toolName: "escalateToComplianceOfficer",
    mode: "block",
  },
  { domain: "compliance", stage: 1, toolName: "escalateToManagement", mode: "block" },

  { domain: "compliance", stage: 2, toolName: "sendAdvisorAlert", mode: "block" },
  { domain: "compliance", stage: 2, toolName: "sendClientReminder", mode: "auto" },
  {
    domain: "compliance",
    stage: 2,
    toolName: "escalateToComplianceOfficer",
    mode: "block",
  },
  { domain: "compliance", stage: 2, toolName: "escalateToManagement", mode: "block" },

  { domain: "compliance", stage: 3, toolName: "sendAdvisorAlert", mode: "auto" },
  { domain: "compliance", stage: 3, toolName: "sendClientReminder", mode: "auto" },
  {
    domain: "compliance",
    stage: 3,
    toolName: "escalateToComplianceOfficer",
    mode: "block",
  },
  { domain: "compliance", stage: 3, toolName: "escalateToManagement", mode: "block" },

  { domain: "compliance", stage: 4, toolName: "sendAdvisorAlert", mode: "block" },
  { domain: "compliance", stage: 4, toolName: "sendClientReminder", mode: "block" },
  {
    domain: "compliance",
    stage: 4,
    toolName: "escalateToComplianceOfficer",
    mode: "approve",
  },
  { domain: "compliance", stage: 4, toolName: "escalateToManagement", mode: "block" },

  { domain: "compliance", stage: 5, toolName: "sendAdvisorAlert", mode: "block" },
  { domain: "compliance", stage: 5, toolName: "sendClientReminder", mode: "block" },
  {
    domain: "compliance",
    stage: 5,
    toolName: "escalateToComplianceOfficer",
    mode: "block",
  },
  {
    domain: "compliance",
    stage: 5,
    toolName: "escalateToManagement",
    mode: "approve",
  },

  // Onboarding stages 1–4
  { domain: "onboarding", stage: 1, toolName: "requestDocument", mode: "auto" },
  { domain: "onboarding", stage: 1, toolName: "advanceOnboardingStage", mode: "auto" },
  { domain: "onboarding", stage: 1, toolName: "completeOnboarding", mode: "block" },
  { domain: "onboarding", stage: 1, toolName: "alertAdvisorStuck", mode: "auto" },
  { domain: "onboarding", stage: 1, toolName: "sendStageProgressNotice", mode: "auto" },
  { domain: "onboarding", stage: 1, toolName: "sendOnboardingCompleteNotice", mode: "block" },

  { domain: "onboarding", stage: 2, toolName: "requestDocument", mode: "auto" },
  { domain: "onboarding", stage: 2, toolName: "advanceOnboardingStage", mode: "auto" },
  { domain: "onboarding", stage: 2, toolName: "completeOnboarding", mode: "block" },
  { domain: "onboarding", stage: 2, toolName: "alertAdvisorStuck", mode: "auto" },
  { domain: "onboarding", stage: 2, toolName: "sendStageProgressNotice", mode: "auto" },
  { domain: "onboarding", stage: 2, toolName: "sendOnboardingCompleteNotice", mode: "block" },

  { domain: "onboarding", stage: 3, toolName: "requestDocument", mode: "auto" },
  { domain: "onboarding", stage: 3, toolName: "advanceOnboardingStage", mode: "auto" },
  { domain: "onboarding", stage: 3, toolName: "completeOnboarding", mode: "block" },
  { domain: "onboarding", stage: 3, toolName: "alertAdvisorStuck", mode: "auto" },
  { domain: "onboarding", stage: 3, toolName: "sendStageProgressNotice", mode: "auto" },
  { domain: "onboarding", stage: 3, toolName: "sendOnboardingCompleteNotice", mode: "block" },

  { domain: "onboarding", stage: 4, toolName: "requestDocument", mode: "auto" },
  { domain: "onboarding", stage: 4, toolName: "advanceOnboardingStage", mode: "block" },
  { domain: "onboarding", stage: 4, toolName: "completeOnboarding", mode: "auto" },
  { domain: "onboarding", stage: 4, toolName: "alertAdvisorStuck", mode: "auto" },
  { domain: "onboarding", stage: 4, toolName: "sendStageProgressNotice", mode: "auto" },
  { domain: "onboarding", stage: 4, toolName: "sendOnboardingCompleteNotice", mode: "auto" },
];

/**
 * Returns the Zod-validated tool policy matrix (version from env/config).
 */
export function getToolPolicyMatrix(): ToolPolicyMatrix {
  const serializable = toolPolicyMatrixSchema.parse({
    version: env.TOOL_POLICY_VERSION,
    rules: DEFAULT_RULES.map(({ domain, stage, toolName, mode, argPredicateId }) => ({
      domain,
      stage,
      toolName,
      mode,
      argPredicateId,
    })),
  });

  // Re-attach runtime `when` predicates from defaults (not serializable via Zod).
  const rules: ToolPolicyRule[] = serializable.rules.map((rule) => {
    const match = DEFAULT_RULES.find(
      (r) =>
        r.domain === rule.domain &&
        r.stage === rule.stage &&
        r.toolName === rule.toolName &&
        r.mode === rule.mode,
    );
    return match?.when ? { ...rule, when: match.when } : rule;
  });

  return { version: serializable.version, rules };
}

/**
 * Evaluates stage × tool policy with deny-wins semantics (no ledger writes).
 */
export function evaluateToolPolicy(
  input: EvaluateToolPolicyInput,
  matrix: ToolPolicyMatrix = getToolPolicyMatrix(),
): ToolPolicyDecision {
  const parsed = evaluateToolPolicyInputSchema.parse(input);
  const args = parsed.args ?? {};

  const matching: ToolPolicyRule[] = matrix.rules.filter((rule) => {
    if (rule.domain !== parsed.domain) return false;
    if (rule.stage !== parsed.stage) return false;
    if (rule.toolName !== parsed.toolName) return false;
    const when = rule.when;
    if (when && !when(args)) return false;
    return true;
  });

  if (matching.length === 0) {
    return toolPolicyDecisionSchema.parse({
      mode: "block",
      policyVersion: matrix.version,
      reasonCode: "NO_MATCHING_RULE",
      matchedRuleCount: 0,
    });
  }

  // Deny-wins: any block beats approve/auto; any approve beats auto.
  if (matching.some((r) => r.mode === "block")) {
    return toolPolicyDecisionSchema.parse({
      mode: "block",
      policyVersion: matrix.version,
      reasonCode: "DENY_WINS",
      matchedRuleCount: matching.length,
    });
  }

  if (matching.some((r) => r.mode === "approve")) {
    return toolPolicyDecisionSchema.parse({
      mode: "approve",
      policyVersion: matrix.version,
      reasonCode: "REQUIRES_APPROVAL",
      matchedRuleCount: matching.length,
    });
  }

  return toolPolicyDecisionSchema.parse({
    mode: "auto",
    policyVersion: matrix.version,
    reasonCode: "ALLOW_AUTO",
    matchedRuleCount: matching.length,
  });
}
