import type { VaultService } from "@/lib/db/vault-service";
import { env } from "@/lib/config";
import { evaluateToolPolicy } from "@/lib/policy";
import { buildSendAdvisorAlert } from "@/tools/shared/sendAdvisorAlert";
import { buildSendClientReminder } from "@/tools/compliance/sendClientReminder";
import { buildRequestMissingDocument } from "@/tools/compliance/requestMissingDocument";
import { buildRequestDocument } from "@/tools/onboarding/requestDocument";
import { buildValidateDocumentReceived } from "@/tools/onboarding/validateDocumentReceived";
import { buildAdvanceOnboardingStage } from "@/tools/onboarding/advanceOnboardingStage";
import { buildCompleteOnboarding } from "@/tools/onboarding/completeOnboarding";
import { buildAlertAdvisorStuck } from "@/tools/onboarding/alertAdvisorStuck";
import { beginHitlSuspend } from "@/lib/hitl/suspend";
import type { MockAgentDecision } from "./mock-agent";

async function invoke<T>(tool: unknown, input: Record<string, unknown>): Promise<T> {
  return (tool as { execute(input: Record<string, unknown>): Promise<T> }).execute(input);
}

/** Runs deterministic decisions through the same policy-gated tools as Mastra. */
export async function executeMockDecision(
  vault: VaultService,
  agentType: "COMPLIANCE" | "ONBOARDING",
  decision: MockAgentDecision,
): Promise<{ outcome: string; followUp: boolean }> {
  if (!env.DRY_RUN) throw new Error("Simulation requires DRY_RUN=true");
  const reasoning = `Simulation decision: ${decision.reasoning} Vault state and stage were checked before action.`;

  if (decision.actionTaken === "SCAN_VAULT") {
    await vault.logAction({ agentType, actionType: "SCAN_VAULT", trigger: "SIMULATION", reasoning, outcome: "NO_ACTION" });
    return { outcome: "NO_ACTION", followUp: false };
  }

  if (agentType === "ONBOARDING") {
    switch (decision.actionTaken) {
      case "REQUEST_DOCUMENT":
        if (!decision.documentType) throw new Error("Mock request lacks a document type");
        await invoke(buildRequestDocument(vault), { documentType: decision.documentType,
          message: `Please provide ${decision.documentType} to continue onboarding.`, reasoning });
        return { outcome: "REQUESTED", followUp: false };
      case "VALIDATE_DOCUMENT": {
        if (!decision.documentId) throw new Error("Mock validation lacks a document id");
        const result = await invoke<{ valid: boolean }>(buildValidateDocumentReceived(vault), { documentId: decision.documentId });
        return { outcome: result.valid ? "VALIDATED" : "BLOCKED", followUp: result.valid };
      }
      case "ADVANCE_STAGE": {
        const profile = await vault.getClientProfile() as { onboardingStage: number };
        if (profile.onboardingStage === 0) {
          await vault.upsertOnboardingStageState({ stage: 1, status: "IN_PROGRESS",
            checklistSnapshot: { bootstrap: "already_valid_identity_checklist" } });
          await vault.logAction({ agentType: "ONBOARDING", actionType: "ADVANCE_STAGE", trigger: "SIMULATION",
            reasoning, outcome: "ADVANCED_FROM_STAGE_0_TO_1", stage: 0 });
        } else {
          await invoke(buildAdvanceOnboardingStage(vault), { reasoning });
        }
        return { outcome: "ADVANCED", followUp: true };
      }
      case "COMPLETE_ONBOARDING":
        await invoke(buildCompleteOnboarding(vault), { reasoning });
        return { outcome: "COMPLETED", followUp: false };
      case "ALERT_ADVISOR_STUCK":
        await invoke(buildAlertAdvisorStuck(vault), { reasoning, daysSinceLastResponse: 7 });
        return { outcome: "STALLED", followUp: false };
    }
  }

  if (agentType === "COMPLIANCE") {
    switch (decision.actionTaken) {
      case "NOTIFY_ADVISOR":
        await invoke(buildSendAdvisorAlert(vault), { subject: "Synthetic compliance alert",
          body: reasoning, reasoning });
        return { outcome: "ALERTED", followUp: false };
      case "REQUEST_DOCUMENT":
        if (!decision.documentType) throw new Error("Mock compliance request lacks a document type");
        await invoke(buildRequestMissingDocument(vault), { documentType: decision.documentType,
          message: `Please provide the required ${decision.documentType}.`, reasoning });
        return { outcome: "REQUESTED", followUp: false };
      case "SEND_CLIENT_REMINDER":
        if (!decision.documentId) throw new Error("Mock reminder lacks a document id");
        if (decision.escalationStage === 3) {
          await invoke(buildSendAdvisorAlert(vault), { subject: "Synthetic compliance follow-up",
            body: reasoning, reasoning });
        }
        await invoke(buildSendClientReminder(vault), { documentId: decision.documentId,
          subject: "Required document follow-up", body: reasoning, reasoning });
        return { outcome: "REMINDER_SENT", followUp: false };
      case "ESCALATE_COMPLIANCE":
      case "ESCALATE_MANAGEMENT": {
        const stage = decision.escalationStage ?? 0;
        const toolName = decision.actionTaken === "ESCALATE_COMPLIANCE"
          ? "escalateToComplianceOfficer" : "escalateToManagement";
        const policy = evaluateToolPolicy({ domain: "compliance", stage, toolName });
        if (policy.mode !== "approve") throw new Error(`Unexpected escalation policy ${policy.mode} for stage ${stage}`);
        await beginHitlSuspend({ vault, clientId: vault.getClientId(), toolName,
          actionType: decision.actionTaken, stage, reasoning,
          policyVersion: policy.policyVersion, documentId: decision.documentId,
          startWorkflow: async () => ({ workflowRunId: `mock-${vault.getClientId()}-${stage}` }),
          scheduleTimeout: async () => {},
        });
        return { outcome: "PENDING_APPROVAL", followUp: false };
      }
    }
  }

  throw new Error(`Unsupported mock decision ${agentType}:${decision.actionTaken}`);
}
