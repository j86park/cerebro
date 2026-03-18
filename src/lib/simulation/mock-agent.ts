import { ActionType, AgentType, DocumentStatus, TriggerType } from "@/lib/db/enums";
import { VaultService } from "@/lib/db/vault-service";
import { getComplianceScorecard } from "@/lib/compliance/scorecard";
import { ONBOARDING_STAGES } from "@/lib/documents/onboarding-stages";

export interface MockAgentDecision {
  actionTaken: keyof typeof ActionType;
  escalationStage?: number;
  onboardingStage?: number;
  reasoning: string;
}

export class MockAgent {
  async decide(vault: VaultService, agentType: keyof typeof AgentType, trigger: keyof typeof TriggerType): Promise<MockAgentDecision> {
    if (agentType === "COMPLIANCE") {
      return this.decideCompliance(vault, trigger);
    } else {
      return this.decideOnboarding(vault, trigger);
    }
  }

  private async decideCompliance(vault: VaultService, trigger: keyof typeof TriggerType): Promise<MockAgentDecision> {
    const scorecard = await getComplianceScorecard(vault);
    const history = (await vault.getActionHistory() as any[]).filter(h => h.agentType === "COMPLIANCE");
    
    // 1. If everything is compliant, just scan
    if (scorecard.summary.highestUrgency === "NONE" && !scorecard.summary.hasBlocker) {
      return {
        actionTaken: "SCAN_VAULT",
        reasoning: "All documents are compliant.",
      };
    }

    // 2. Escalation logic based on COMPLIANCE_SYSTEM_PROMPT
    const stage1Action = history.find(h => h.escalationStage === 1);
    
    if (!stage1Action) {
      return {
        actionTaken: "NOTIFY_ADVISOR",
        escalationStage: 1,
        reasoning: `Issue detected (Highest urgency: ${scorecard.summary.highestUrgency}). Starting escalation at Stage 1.`,
      };
    }

    const now = vault.getNow();
    const daysSinceStage1 = Math.floor((now.getTime() - new Date(stage1Action.performedAt).getTime()) / (1000 * 60 * 60 * 24));
    
    // Find latest action to check cooldown (5 days)
    const latestAction = history[0];
    const daysSinceLatest = Math.floor((now.getTime() - new Date(latestAction.performedAt).getTime()) / (1000 * 60 * 60 * 24));

    if (daysSinceLatest < 5) {
       return { actionTaken: "SCAN_VAULT", reasoning: "Waiting for cooldown (5 days) before repeating escalation." };
    }

    if (daysSinceStage1 >= 30) return { actionTaken: "ESCALATE_MANAGEMENT", escalationStage: 5, reasoning: "30+ days unresolved." };
    if (daysSinceStage1 >= 20) return { actionTaken: "ESCALATE_COMPLIANCE", escalationStage: 4, reasoning: "20+ days unresolved." };
    if (daysSinceStage1 >= 10) return { actionTaken: "SEND_CLIENT_REMINDER", escalationStage: 3, reasoning: "10+ days unresolved." };
    if (daysSinceStage1 >= 5)  return { actionTaken: "SEND_CLIENT_REMINDER", escalationStage: 2, reasoning: "5+ days unresolved." };

    return {
      actionTaken: "SCAN_VAULT",
      reasoning: "Waiting for escalation thresholds.",
    };
  }

  private async decideOnboarding(vault: VaultService, trigger: keyof typeof TriggerType): Promise<MockAgentDecision> {
    const client = await vault.getClientProfile() as any;
    const documents = await vault.getDocuments() as any[];
    const history = await vault.getActionHistory() as any[];
    
    const currentStage = client.onboardingStage;
    const stageConfig = ONBOARDING_STAGES[currentStage];
    const requiredDocs = stageConfig?.requiredDocuments || [];
    
    const stageDocs = requiredDocs.map(type => documents.find(d => d.type === type));
    const allValid = stageDocs.every(d => d && d.status === DocumentStatus.VALID);

    // 1. Advance if all valid
    if (allValid) {
      if (currentStage === Object.keys(ONBOARDING_STAGES).length) {
        return { actionTaken: "COMPLETE_ONBOARDING", onboardingStage: currentStage, reasoning: "All onboarding requirements met." };
      }
      return { actionTaken: "ADVANCE_STAGE", onboardingStage: currentStage + 1, reasoning: `All docs for Stage ${currentStage} valid. Advancing.` };
    }

    // 2. Explicit Trigger logic
    if (trigger === "EVENT_UPLOAD") {
      return { actionTaken: "VALIDATE_DOCUMENT", onboardingStage: currentStage, reasoning: "New document uploaded. Validating." };
    }

    // 3. Request/Stuck logic
    const onboardingHistory = history.filter(h => h.agentType === "ONBOARDING");
    const latestRequest = onboardingHistory.find(h => h.actionType === "REQUEST_DOCUMENT");
    const now = vault.getNow();
    
    if (!latestRequest) {
      return { actionTaken: "REQUEST_DOCUMENT", onboardingStage: currentStage, reasoning: `Initial request for Stage ${currentStage} documents.` };
    }

    const daysSince = Math.floor((now.getTime() - new Date(latestRequest.performedAt).getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysSince >= 7) {
      return { actionTaken: "ALERT_ADVISOR_STUCK", onboardingStage: currentStage, reasoning: "Client stuck in onboarding for 7+ days. Alerting advisor." };
    }
    
    if (daysSince >= 3) {
      return { actionTaken: "REQUEST_DOCUMENT", onboardingStage: currentStage, reasoning: "Repeating document request after 3-day cooldown." };
    }

    return {
      actionTaken: "SCAN_VAULT",
      onboardingStage: currentStage,
      reasoning: "Waiting for client response or document validation.",
    };
  }
}
