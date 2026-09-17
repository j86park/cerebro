import type { VaultService } from "@/lib/db/vault-service";
import { assertDomainToolAllowlist } from "@/lib/policy/toolAllowlists";
import { buildGetDocumentComplianceStatus } from "./getDocumentComplianceStatus";
import { buildSendClientReminder } from "./sendClientReminder";
import { buildEscalateToComplianceOfficer } from "./escalateToComplianceOfficer";
import { buildEscalateToManagement } from "./escalateToManagement";
import { buildUpdateDocumentStatus } from "./updateDocumentStatus";
import { buildMarkResolved } from "./markResolved";

export {
  buildGetDocumentComplianceStatus,
  buildSendClientReminder,
  buildEscalateToComplianceOfficer,
  buildEscalateToManagement,
  buildUpdateDocumentStatus,
  buildMarkResolved,
};

/**
 * Builds the compliance domain toolset and asserts the agent tool allowlist.
 */
export function buildComplianceTools(vault: VaultService) {
  const tools = {
    getDocumentComplianceStatus: buildGetDocumentComplianceStatus(vault),
    sendClientReminder: buildSendClientReminder(vault),
    escalateToComplianceOfficer: buildEscalateToComplianceOfficer(vault),
    escalateToManagement: buildEscalateToManagement(vault),
    updateDocumentStatus: buildUpdateDocumentStatus(vault),
    markResolved: buildMarkResolved(vault),
  };
  assertDomainToolAllowlist("compliance", Object.keys(tools));
  return tools;
}
