import type { VaultService } from "@/lib/db/vault-service";
import { resolveComplianceLadderStage } from "@/lib/policy";
import { buildSendAdvisorAlert } from "@/tools/shared/sendAdvisorAlert";

export type ComplianceOutcomeGateResult =
  | { applied: false; reason: "NO_EXPIRED_DOCUMENT" | "ESCALATION_ALREADY_STARTED" }
  | { applied: true; documentId: string };

/**
 * A completed model turn is not itself a compliance outcome. If an expired
 * document was observed but Stage 1 never began, execute the existing
 * policy-gated advisor alert instead of silently recording a successful scan.
 * Later ladder stages remain entirely under their normal policy/HITL flow.
 */
export async function ensureExpiredDocumentStageOneAlert(
  vault: VaultService,
): Promise<ComplianceOutcomeGateResult> {
  const documents = (await vault.getDocuments()) as Array<{
    id: string;
    type: string;
    status: string;
  }>;
  const expired = documents.find((document) => document.status === "EXPIRED");
  if (!expired) return { applied: false, reason: "NO_EXPIRED_DOCUMENT" };

  const history = (await vault.getActionHistory()) as Array<{
    actionType: string;
    outcome?: string | null;
  }>;
  if (resolveComplianceLadderStage(history) !== 1) {
    return { applied: false, reason: "ESCALATION_ALREADY_STARTED" };
  }

  const tool = buildSendAdvisorAlert(vault, { agentType: "COMPLIANCE" });
  if (!tool.execute) throw new Error("sendAdvisorAlert is not executable");
  const alert = await tool.execute({
    subject: `Compliance action required: expired ${expired.type}`,
    body: `Cerebro detected an expired ${expired.type} in client ${vault.getClientId()}'s vault. ` +
      `Please review the document and arrange a valid replacement. ` +
      `This is the initial Stage 1 compliance alert.`,
    reasoning: `The vault contains expired document ${expired.id}. No successful advisor alert or later ` +
      `escalation is recorded. Stage 1 policy requires notifying the advisor before the scan is complete.`,
  }, {} as Parameters<NonNullable<typeof tool.execute>>[1]);
  if (!alert || !("success" in alert) || !alert.success) {
    throw new Error(`Stage 1 advisor alert did not succeed for document ${expired.id}`);
  }
  return { applied: true, documentId: expired.id };
}
