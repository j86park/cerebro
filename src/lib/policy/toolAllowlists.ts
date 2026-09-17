import { z } from "zod";

const agentDomainSchema = z.enum(["compliance", "onboarding"]);

export type AgentDomain = z.infer<typeof agentDomainSchema>;

/** Tools both agents may receive via the shared toolset. */
export const SHARED_TOOL_ALLOWLIST = [
  "getClientProfile",
  "getActionHistory",
  "logAction",
  "sendAdvisorAlert",
  "getOpenEscalations",
  "getDocumentForReview",
  "getChecklistGaps",
] as const;

/** Compliance-domain tools only — never attached to onboarding runs. */
export const COMPLIANCE_TOOL_ALLOWLIST = [
  "getDocumentComplianceStatus",
  "sendClientReminder",
  "escalateToComplianceOfficer",
  "escalateToManagement",
  "updateDocumentStatus",
  "markResolved",
] as const;

/** Onboarding-domain tools only — never attached to compliance runs. */
export const ONBOARDING_TOOL_ALLOWLIST = [
  "getOnboardingStatus",
  "requestDocument",
  "validateDocumentReceived",
  "setDocumentStatus",
  "advanceOnboardingStage",
  "completeOnboarding",
  "alertAdvisorStuck",
  "sendStageProgressNotice",
  "sendOnboardingCompleteNotice",
] as const;

export type SharedToolName = (typeof SHARED_TOOL_ALLOWLIST)[number];
export type ComplianceToolName = (typeof COMPLIANCE_TOOL_ALLOWLIST)[number];
export type OnboardingToolName = (typeof ONBOARDING_TOOL_ALLOWLIST)[number];

/**
 * Returns the full set of tool names allowed for an agent domain (shared ∪ domain).
 */
export function getAllowedToolNamesForAgent(
  domain: AgentDomain,
): ReadonlySet<string> {
  const parsed = agentDomainSchema.parse(domain);
  const domainTools =
    parsed === "compliance"
      ? COMPLIANCE_TOOL_ALLOWLIST
      : ONBOARDING_TOOL_ALLOWLIST;
  return new Set<string>([...SHARED_TOOL_ALLOWLIST, ...domainTools]);
}

/**
 * Returns the domain-only allowlist (excludes shared tools).
 */
export function getDomainToolAllowlist(
  domain: AgentDomain,
): readonly string[] {
  const parsed = agentDomainSchema.parse(domain);
  return parsed === "compliance"
    ? COMPLIANCE_TOOL_ALLOWLIST
    : ONBOARDING_TOOL_ALLOWLIST;
}

/**
 * Fail-closed check that a domain toolset contains exactly the allowlisted tools.
 * Throws if unknown tools appear or required tools are missing.
 */
export function assertDomainToolAllowlist(
  domain: AgentDomain,
  toolNames: readonly string[],
): void {
  const parsed = agentDomainSchema.parse(domain);
  const allowed = new Set(getDomainToolAllowlist(parsed));
  const actual = new Set(toolNames);

  for (const name of actual) {
    if (!allowed.has(name)) {
      throw new Error(
        `Tool "${name}" is not on the ${parsed} agent allowlist`,
      );
    }
  }

  for (const name of allowed) {
    if (!actual.has(name)) {
      throw new Error(
        `Required ${parsed} allowlist tool "${name}" is missing from toolset`,
      );
    }
  }
}

/**
 * Fail-closed check that a combined agent toolset (shared + domain) matches allowlist.
 */
export function assertAgentToolAllowlist(
  domain: AgentDomain,
  toolNames: readonly string[],
): void {
  const parsed = agentDomainSchema.parse(domain);
  const allowed = getAllowedToolNamesForAgent(parsed);
  const actual = new Set(toolNames);
  const forbidden =
    parsed === "compliance"
      ? ONBOARDING_TOOL_ALLOWLIST
      : COMPLIANCE_TOOL_ALLOWLIST;

  for (const name of forbidden) {
    if (actual.has(name)) {
      throw new Error(
        `Cross-domain tool "${name}" must not appear on ${parsed} agent toolset`,
      );
    }
  }

  for (const name of actual) {
    if (!allowed.has(name)) {
      throw new Error(
        `Tool "${name}" is not allowed for ${parsed} agent`,
      );
    }
  }

  for (const name of allowed) {
    if (!actual.has(name)) {
      throw new Error(
        `Required allowlist tool "${name}" missing for ${parsed} agent`,
      );
    }
  }
}
