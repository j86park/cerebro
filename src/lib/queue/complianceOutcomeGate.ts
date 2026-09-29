import type { VaultService } from "@/lib/db/vault-service";
import { resolveComplianceLadderStage } from "@/lib/policy";
import { buildSendAdvisorAlert } from "@/tools/shared/sendAdvisorAlert";
import { buildSendClientReminder } from "@/tools/compliance/sendClientReminder";
import { buildEscalateToManagement } from "@/tools/compliance/escalateToManagement";

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

/** Enforce the due Stage 3 pair when a model turn incorrectly concludes that ten days have not elapsed. */
export async function ensureDueStageThreeActions(vault: VaultService): Promise<{ applied: boolean; documentId?: string }> {
  const documents = await vault.getDocuments() as Array<{ id: string; type: string; status: string }>;
  const expired = documents.find((document) => document.status === "EXPIRED");
  if (!expired) return { applied: false };
  const history = await vault.getActionHistory() as Array<{
    actionType: string; outcome?: string | null; stage?: number | null;
    effectiveAt?: Date | null; performedAt: Date;
  }>;
  if (resolveComplianceLadderStage(history) !== 3) return { applied: false };
  const firstAlert = history.find((action) => action.actionType === "NOTIFY_ADVISOR" && action.stage === 1
    && action.outcome !== "POLICY_BLOCKED");
  if (!firstAlert) return { applied: false };
  const age = vault.getNow().getTime() - new Date(firstAlert.effectiveAt ?? firstAlert.performedAt).getTime();
  if (age < 10 * 24 * 60 * 60 * 1000) return { applied: false };

  let applied = false;
  if (!history.some((action) => action.actionType === "NOTIFY_ADVISOR" && action.stage === 3
    && action.outcome !== "POLICY_BLOCKED")) {
    const tool = buildSendAdvisorAlert(vault, { agentType: "COMPLIANCE" });
    if (!tool.execute) throw new Error("sendAdvisorAlert is not executable");
    await tool.execute({
      subject: `Compliance follow-up: expired ${expired.type}`,
      body: `The ${expired.type} remains expired ten days after the initial advisor alert. Please arrange replacement.`,
      reasoning: `Stage 3 is due: document ${expired.id} is still expired more than ten days after the Stage 1 alert. Notify the advisor again.`,
    }, {} as Parameters<NonNullable<typeof tool.execute>>[1]);
    applied = true;
  }
  if (!history.some((action) => action.actionType === "SEND_CLIENT_REMINDER" && action.stage === 3
    && action.outcome !== "POLICY_BLOCKED")) {
    const tool = buildSendClientReminder(vault);
    if (!tool.execute) throw new Error("sendClientReminder is not executable");
    await tool.execute({
      documentId: expired.id,
      subject: `Second reminder: update your ${expired.type}`,
      body: `Your ${expired.type} is still expired. Please provide a valid replacement document.`,
      reasoning: `Stage 3 is due: document ${expired.id} remains expired more than ten days after the Stage 1 alert and at least five days after the first client reminder.`,
    }, {} as Parameters<NonNullable<typeof tool.execute>>[1]);
    applied = true;
  }
  return { applied, documentId: expired.id };
}

/** Stage 5 may be proposed only after a recorded advisor approval of Stage 4. */
export async function ensureDueStageFiveApproval(vault: VaultService): Promise<{ applied: boolean; documentId?: string }> {
  const documents = await vault.getDocuments() as Array<{ id: string; status: string }>;
  const expired = documents.find((document) => document.status === "EXPIRED");
  if (!expired) return { applied: false };
  const history = await vault.getActionHistory() as Array<{
    actionType: string; outcome?: string | null; stage?: number | null;
    effectiveAt?: Date | null; performedAt: Date; actor?: string; reasonCodes?: string[];
  }>;
  if (resolveComplianceLadderStage(history) !== 5) return { applied: false };
  if (history.some((action) => action.actionType === "ESCALATE_MANAGEMENT" && action.outcome !== "POLICY_BLOCKED")) {
    return { applied: false };
  }
  const approved = history.some((action) => action.actionType === "ESCALATE_COMPLIANCE"
    && action.stage === 4 && action.actor === "ADVISOR"
    && action.reasonCodes?.includes("HITL_APPROVED"));
  if (!approved) return { applied: false };
  const firstAlert = history.find((action) => action.actionType === "NOTIFY_ADVISOR"
    && action.stage === 1 && action.outcome !== "POLICY_BLOCKED");
  if (!firstAlert) return { applied: false };
  const age = vault.getNow().getTime() - new Date(firstAlert.effectiveAt ?? firstAlert.performedAt).getTime();
  if (age < 30 * 24 * 60 * 60 * 1000) return { applied: false };
  const tool = buildEscalateToManagement(vault);
  if (!tool.execute) throw new Error("escalateToManagement is not executable");
  const result = await tool.execute({
    reasoning: `Stage 5 is due: document ${expired.id} remains expired thirty days after the initial advisor alert. Stage 4 was explicitly approved by the synthetic advisor and remains unresolved. Request management escalation approval.`,
  }, {} as Parameters<NonNullable<typeof tool.execute>>[1]);
  if (!result || !("pendingApproval" in result) || !result.pendingApproval) {
    throw new Error(`Stage 5 did not reach advisor approval for document ${expired.id}`);
  }
  return { applied: true, documentId: expired.id };
}
