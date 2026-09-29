import type { AgentAction, Client, Document } from "@prisma/client";
import { ActionType, AgentType, DocumentStatus, TriggerType } from "@/lib/db/enums";
import { VaultService } from "@/lib/db/vault-service";
import { getComplianceScorecard, rankDocumentsByUrgency } from "@/lib/compliance/scorecard";
import { computeChecklistGaps, getTotalOnboardingStages, resolveStageChecklist } from "@/lib/documents/checklist";

export interface MockAgentDecision {
  actionTaken: keyof typeof ActionType;
  escalationStage?: number;
  onboardingStage?: number;
  documentId?: string;
  documentType?: string;
  reasoning: string;
}

export class MockAgent {
  async decide(vault: VaultService, agentType: keyof typeof AgentType, _trigger: keyof typeof TriggerType): Promise<MockAgentDecision> {
    if (agentType === "COMPLIANCE") {
      return this.decideCompliance(vault);
    } else {
      return this.decideOnboarding(vault);
    }
  }

  private async decideCompliance(vault: VaultService): Promise<MockAgentDecision> {
    const scorecard = await getComplianceScorecard(vault);
    const history = (await vault.getActionHistory() as AgentAction[]).filter(
      (h) => h.agentType === "COMPLIANCE"
    );
    
    // 1. If everything is compliant, just scan
    if (scorecard.summary.highestUrgency === "NONE" && !scorecard.summary.hasBlocker) {
      return {
        actionTaken: "SCAN_VAULT",
        reasoning: "All documents are compliant.",
      };
    }

    // 2. Escalation logic — schema has no persisted escalationStage; first NOTIFY_ADVISOR marks stage 1.
    const stage1Action = history.find((h) => h.actionType === "NOTIFY_ADVISOR" && h.outcome !== "POLICY_BLOCKED");
    const target = rankDocumentsByUrgency(scorecard.documents).find((doc) => doc.urgency !== "NONE");
    
    if (!stage1Action) {
      return {
        actionTaken: "NOTIFY_ADVISOR",
        escalationStage: 1,
        documentId: target?.documentId ?? undefined,
        reasoning: `Issue detected (Highest urgency: ${scorecard.summary.highestUrgency}). Starting escalation at Stage 1.`,
      };
    }

    const now = vault.getNow();
    const actionAt = (action: AgentAction) => action.effectiveAt ?? action.performedAt;
    const daysSinceStage1 = Math.floor((now.getTime() - actionAt(stage1Action).getTime()) / (1000 * 60 * 60 * 24));
    const completed = history.filter((h) =>
      ["NOTIFY_ADVISOR", "SEND_CLIENT_REMINDER", "ESCALATE_COMPLIANCE", "ESCALATE_MANAGEMENT"].includes(h.actionType) &&
      h.outcome !== "POLICY_BLOCKED" && h.outcome !== "PENDING_APPROVAL" && h.outcome !== "HITL_SUSPENDED"
    );
    const pendingApproval = history.find((h) =>
      (h.outcome === "PENDING_APPROVAL" || h.outcome === "HITL_SUSPENDED") &&
      (h.actionType === "ESCALATE_COMPLIANCE" || h.actionType === "ESCALATE_MANAGEMENT") &&
      !completed.some((done) => done.actionType === h.actionType && done.stage === h.stage)
    );
    if (pendingApproval) return { actionTaken: "SCAN_VAULT", reasoning: "Waiting for simulated advisor approval." };
    if (completed.some((h) => h.actionType === "ESCALATE_MANAGEMENT")) {
      return { actionTaken: "SCAN_VAULT", reasoning: "Management escalation is already completed." };
    }
    if (completed.some((h) => h.actionType === "ESCALATE_COMPLIANCE") && daysSinceStage1 < 30) {
      return { actionTaken: "SCAN_VAULT", reasoning: "Compliance-officer escalation is complete; waiting for Stage 5 threshold." };
    }
    const latestAction = completed[0];
    const daysSinceLatest = latestAction
      ? Math.floor((now.getTime() - actionAt(latestAction).getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    if (daysSinceLatest < 5) {
       return { actionTaken: "SCAN_VAULT", reasoning: "Waiting for cooldown (5 days) before repeating escalation." };
    }

    const reminders = completed.filter((h) => h.actionType === "SEND_CLIENT_REMINDER").length;
    if (daysSinceStage1 >= 30 && completed.some((h) => h.actionType === "ESCALATE_COMPLIANCE"))
      return { actionTaken: "ESCALATE_MANAGEMENT", escalationStage: 5, documentId: target?.documentId ?? undefined, reasoning: "30+ days unresolved." };
    if (daysSinceStage1 >= 20 && reminders >= 2)
      return { actionTaken: "ESCALATE_COMPLIANCE", escalationStage: 4, documentId: target?.documentId ?? undefined, reasoning: "20+ days unresolved." };
    if (daysSinceStage1 >= 10 && reminders >= 1 && reminders < 2) {
      if (target?.documentId) return { actionTaken: "SEND_CLIENT_REMINDER", escalationStage: 3, documentId: target.documentId, reasoning: "10+ days unresolved." };
      const lastRequest = history.find((h) => h.actionType === "REQUEST_DOCUMENT" && h.outcome !== "POLICY_BLOCKED");
      if (lastRequest && now.getTime() - actionAt(lastRequest).getTime() < 3 * 24 * 60 * 60 * 1000) {
        return { actionTaken: "SCAN_VAULT", reasoning: "Waiting for the three-day document-request cooldown." };
      }
      return { actionTaken: "REQUEST_DOCUMENT", escalationStage: 3, documentType: target?.type, reasoning: "Required document still missing before second reminder." };
    }
    if (daysSinceStage1 >= 5 && reminders === 0) {
      if (target?.documentId) return { actionTaken: "SEND_CLIENT_REMINDER", escalationStage: 2, documentId: target.documentId, reasoning: "5+ days unresolved." };
      const lastRequest = history.find((h) => h.actionType === "REQUEST_DOCUMENT" && h.outcome !== "POLICY_BLOCKED");
      if (lastRequest && now.getTime() - actionAt(lastRequest).getTime() < 3 * 24 * 60 * 60 * 1000) {
        return { actionTaken: "SCAN_VAULT", reasoning: "Waiting for the three-day document-request cooldown." };
      }
      return { actionTaken: "REQUEST_DOCUMENT", escalationStage: 2, documentType: target?.type, reasoning: "Required document still missing after the advisor alert." };
    }

    return {
      actionTaken: "SCAN_VAULT",
      reasoning: "Waiting for escalation thresholds.",
    };
  }

  private async decideOnboarding(vault: VaultService): Promise<MockAgentDecision> {
    const client = (await vault.getClientProfile()) as Client;
    const documents = (await vault.getDocuments()) as Document[];
    const history = (await vault.getActionHistory()) as AgentAction[];
    
    const currentStage = client.onboardingStage;
    if (client.onboardingStatus === "COMPLETED") {
      return { actionTaken: "SCAN_VAULT", onboardingStage: currentStage, reasoning: "Onboarding is already completed." };
    }
    const checklistContext = {
      stage: currentStage === 0 ? 1 : currentStage,
      accountType: client.accountType,
      riskProfile: client.riskProfile,
    };
    const stageConfig = resolveStageChecklist(checklistContext);
    const gaps = computeChecklistGaps(checklistContext, documents, vault.getNow());
    const allValid = !!stageConfig && gaps.length === 0;
    const firstGap = gaps[0]?.documentType;
    if (currentStage === 0 && allValid) {
      return { actionTaken: "ADVANCE_STAGE", onboardingStage: 1, reasoning: "Identity checklist is already valid; bootstrap Stage 1." };
    }

    // 1. Advance if all valid
    if (currentStage > 0 && allValid) {
      if (currentStage === getTotalOnboardingStages()) {
        return { actionTaken: "COMPLETE_ONBOARDING", onboardingStage: currentStage, reasoning: "All onboarding requirements met." };
      }
      return { actionTaken: "ADVANCE_STAGE", onboardingStage: currentStage + 1, reasoning: `All docs for Stage ${currentStage} valid. Advancing.` };
    }

    // A pending upload remains actionable after another decision changes the trigger
    // to SCHEDULED within the same tick. Never request it again before validation.
    const uploaded = documents.find((d) => d.status === DocumentStatus.PENDING_REVIEW);
    if (uploaded) return { actionTaken: "VALIDATE_DOCUMENT", documentId: uploaded.id,
      onboardingStage: currentStage, reasoning: "Uploaded document is pending review. Validating before any new request." };

    // 3. Request/Stuck logic
    const onboardingHistory = history.filter(h => h.agentType === "ONBOARDING");
    const latestRequest = onboardingHistory.find(h => h.actionType === "REQUEST_DOCUMENT");
    const now = vault.getNow();
    
    if (!latestRequest) {
      return { actionTaken: "REQUEST_DOCUMENT", documentType: firstGap, onboardingStage: currentStage, reasoning: `Initial request for Stage ${currentStage} documents.` };
    }

    const daysSince = Math.floor((now.getTime() - (latestRequest.effectiveAt ?? latestRequest.performedAt).getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysSince >= 7) {
      return { actionTaken: "ALERT_ADVISOR_STUCK", onboardingStage: currentStage, reasoning: "Client stuck in onboarding for 7+ days. Alerting advisor." };
    }
    
    if (daysSince >= 3) {
      return { actionTaken: "REQUEST_DOCUMENT", documentType: firstGap, onboardingStage: currentStage, reasoning: "Repeating document request after 3-day cooldown." };
    }

    return {
      actionTaken: "SCAN_VAULT",
      onboardingStage: currentStage,
      reasoning: "Waiting for client response or document validation.",
    };
  }
}
