import type { VaultService } from "@/lib/db/vault-service";
import { buildGetDocumentComplianceStatus } from "./getDocumentComplianceStatus";
import { buildSendClientReminder } from "./sendClientReminder";
import { buildEscalateToComplianceOfficer } from "./escalateToComplianceOfficer";
import { buildEscalateToManagement } from "./escalateToManagement";
import { buildUpdateDocumentStatus } from "./updateDocumentStatus";

export {
  buildGetDocumentComplianceStatus,
  buildSendClientReminder,
  buildEscalateToComplianceOfficer,
  buildEscalateToManagement,
  buildUpdateDocumentStatus,
};

export function buildComplianceTools(vault: VaultService) {
  return {
    getDocumentComplianceStatus: buildGetDocumentComplianceStatus(vault),
    sendClientReminder: buildSendClientReminder(vault),
    escalateToComplianceOfficer: buildEscalateToComplianceOfficer(vault),
    escalateToManagement: buildEscalateToManagement(vault),
    updateDocumentStatus: buildUpdateDocumentStatus(vault),
  };
}
