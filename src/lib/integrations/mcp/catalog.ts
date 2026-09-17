import { env } from "@/lib/config";
import {
  COMPLIANCE_TOOL_ALLOWLIST,
  ONBOARDING_TOOL_ALLOWLIST,
  SHARED_TOOL_ALLOWLIST,
} from "@/lib/policy/toolAllowlists";
import {
  mcpCatalogSchema,
  mcpToolDescriptorSchema,
  type McpCatalog,
  type McpToolDescriptor,
} from "./types";

/** Read-only observe / status tools — safe to project as non-side-effect. */
const READ_ONLY_TOOLS: ReadonlySet<string> = new Set([
  "getClientProfile",
  "getActionHistory",
  "getOpenEscalations",
  "getDocumentForReview",
  "getChecklistGaps",
  "getDecisionHistory",
  "getDocumentComplianceStatus",
  "getOnboardingStatus",
  "prioritizeDocuments",
]);

const DESCRIPTIONS: Record<string, string> = {
  getClientProfile: "Read client profile for the active vault",
  getActionHistory: "Read ActionLedger history for the active client",
  logAction: "Append an ActionLedger row",
  sendAdvisorAlert: "Notify advisor (external; DRY_RUN gated)",
  getOpenEscalations: "List open escalations",
  getDocumentForReview: "Fetch a document for review",
  getChecklistGaps: "List checklist gaps for stage/risk",
  refreshDocumentExtract: "Re-run document field extract",
  getDecisionHistory: "Read DecisionRecord history",
  getDocumentComplianceStatus: "Compliance status scorecard",
  sendClientReminder: "Send client reminder email",
  escalateToComplianceOfficer: "Escalate to compliance officer",
  escalateToManagement: "Escalate to management",
  updateDocumentStatus: "Update document status",
  markResolved: "Mark compliance issue resolved",
  requestMissingDocument: "Request a missing document",
  prioritizeDocuments: "Rank documents by urgency",
  getOnboardingStatus: "Onboarding stage status",
  requestDocument: "Request an onboarding document",
  validateDocumentReceived: "Validate a received document",
  setDocumentStatus: "Set onboarding document status",
  advanceOnboardingStage: "Advance onboarding stage",
  completeOnboarding: "Complete onboarding",
  alertAdvisorStuck: "Alert advisor of stuck onboarding",
  sendStageProgressNotice: "Send stage progress notice",
  sendOnboardingCompleteNotice: "Send onboarding complete notice",
};

function describe(
  name: string,
  domain: McpToolDescriptor["domain"],
): McpToolDescriptor {
  return mcpToolDescriptorSchema.parse({
    name,
    description: DESCRIPTIONS[name] ?? `Cerebro tool ${name}`,
    domain,
    sideEffect: !READ_ONLY_TOOLS.has(name),
    inputPropertyNames: ["clientId"],
  });
}

/**
 * Lists a read-only MCP catalog projection of existing allowlisted tools.
 * Does not register a live MCP server — watch surface only.
 */
export function listMcpCatalog(): McpCatalog {
  const tools: McpToolDescriptor[] = [
    ...SHARED_TOOL_ALLOWLIST.map((name) => describe(name, "shared")),
    ...COMPLIANCE_TOOL_ALLOWLIST.map((name) => describe(name, "compliance")),
    ...ONBOARDING_TOOL_ALLOWLIST.map((name) => describe(name, "onboarding")),
  ];

  return mcpCatalogSchema.parse({
    tools,
    surfaceEnabled: env.MCP_INTEGRATION_SURFACE,
  });
}

/**
 * True when MCP integration surface flag is on (default false).
 */
export function isMcpIntegrationSurfaceEnabled(): boolean {
  return env.MCP_INTEGRATION_SURFACE;
}
