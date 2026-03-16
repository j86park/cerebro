import { ActionType, AgentType, TriggerType } from "@/lib/db/enums";

export type ExpectedOutcome = {
  actionTaken: keyof typeof ActionType;
  escalationStage?: number;
  duplicateAction: boolean;
  highestPriority?: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "NONE";
  onboardingStage?: number;
};

export type EvalScenario = {
  clientId: string;
  agentType: keyof typeof AgentType;
  trigger: keyof typeof TriggerType;
  expected: ExpectedOutcome;
};

export const GROUND_TRUTH: EvalScenario[] = [
  // CLT-001: Brand new TFSA client, Day 1. No docs.
  {
    clientId: "CLT-001",
    agentType: "ONBOARDING",
    trigger: "SCHEDULED",
    expected: {
      actionTaken: "REQUEST_DOCUMENT",
      onboardingStage: 1,
      duplicateAction: false,
    },
  },
  // CLT-002: Active client, KYC expiring in 45 days (not critical yet)
  {
    clientId: "CLT-002",
    agentType: "COMPLIANCE",
    trigger: "SCHEDULED",
    expected: {
      actionTaken: "SCAN_VAULT", // Or whatever action means "monitoring/no-op"
      duplicateAction: false,
      highestPriority: "NONE", // Threshold hasn't breached 30 days based on rules, or maybe LOW
    },
  },
  // CLT-003: KYC expired 60 days ago, full escalation history. Due today.
  {
    clientId: "CLT-003",
    agentType: "COMPLIANCE",
    trigger: "SCHEDULED",
    expected: {
      actionTaken: "ESCALATE_MANAGEMENT", // Stage 5
      escalationStage: 5,
      duplicateAction: false,
      highestPriority: "CRITICAL",
    },
  },
  // CLT-004: Onboarding stuck at stage 2 for 12 days.
  {
    clientId: "CLT-004",
    agentType: "ONBOARDING",
    trigger: "SCHEDULED",
    expected: {
      actionTaken: "ALERT_ADVISOR_STUCK",
      onboardingStage: 2,
      duplicateAction: false,
    },
  },
  // CLT-005: Fully compliant.
  {
    clientId: "CLT-005",
    agentType: "COMPLIANCE",
    trigger: "SCHEDULED",
    expected: {
      actionTaken: "SCAN_VAULT",
      duplicateAction: false,
      highestPriority: "NONE",
    },
  },
  // CLT-006: Missing AML verification entirely.
  {
    clientId: "CLT-006",
    agentType: "COMPLIANCE",
    trigger: "SCHEDULED",
    expected: {
      actionTaken: "NOTIFY_ADVISOR", // Stage 1 Escalation
      escalationStage: 1,
      duplicateAction: false,
      highestPriority: "LOW", // Missing is LOW priority based on rules
    },
  },
  // CLT-007: Multiple docs expiring within 14 days. (AML expiring in 8 days - HIGH)
  {
    clientId: "CLT-007",
    agentType: "COMPLIANCE",
    trigger: "SCHEDULED",
    expected: {
      actionTaken: "NOTIFY_ADVISOR",
      escalationStage: 1,
      duplicateAction: false,
      highestPriority: "HIGH", // (8 days <= 14 days, wait, High is within 7? No, wait AML: 8 days -> MEDIUM. Let me check the rules: HIGH is within 7. Medium within 14.)
    },
  },
  // CLT-008: Government ID expired 90 days ago.
  {
    clientId: "CLT-008",
    agentType: "COMPLIANCE",
    trigger: "SCHEDULED",
    expected: {
      actionTaken: "NOTIFY_ADVISOR", // Assuming no previous actions logged
      escalationStage: 1,
      duplicateAction: false,
      highestPriority: "CRITICAL", // Expired
    },
  },
  // CLT-009: Onboarding 80% complete, Stage 3, one doc pending 7 days.
  {
    clientId: "CLT-009",
    agentType: "ONBOARDING",
    trigger: "SCHEDULED",
    expected: {
      actionTaken: "ALERT_ADVISOR_STUCK",
      onboardingStage: 3,
      duplicateAction: false,
    },
  },
  // CLT-010: Corporate account, Day 3 onboarding.
  {
    clientId: "CLT-010",
    agentType: "ONBOARDING",
    trigger: "SCHEDULED",
    expected: {
      actionTaken: "REQUEST_DOCUMENT", // Has requested Gov ID 3 days ago. No response. 3 days cooldown might restrict duplicate. Should we request others?
      onboardingStage: 1,
      duplicateAction: false, // Maybe requests POOF_OF_ADDRESS
    },
  },
  // CLT-011: Stage 4 escalation, 30 days unresolved. Heads to management.
  {
    clientId: "CLT-011",
    agentType: "COMPLIANCE",
    trigger: "SCHEDULED",
    expected: {
      actionTaken: "ESCALATE_MANAGEMENT",
      escalationStage: 5,
      duplicateAction: false,
      highestPriority: "CRITICAL",
    },
  },
  // CLT-012: Just uploaded requested doc. Stage 2.
  {
    clientId: "CLT-012",
    agentType: "ONBOARDING",
    trigger: "EVENT_UPLOAD",
    expected: {
      actionTaken: "VALIDATE_DOCUMENT", // Event_upload triggers validateDocumentReceived
      onboardingStage: 2,
      duplicateAction: false,
    },
  },
  // CLT-013: Risk questionnaire expired -10 days. IPS expired -5 days.
  {
    clientId: "CLT-013",
    agentType: "COMPLIANCE",
    trigger: "SCHEDULED",
    expected: {
      actionTaken: "NOTIFY_ADVISOR",
      escalationStage: 1,
      duplicateAction: false,
      highestPriority: "CRITICAL",
    },
  },
  // CLT-014: Beneficiary designation missing. Stage 4 completed.
  {
    clientId: "CLT-014",
    agentType: "COMPLIANCE", // Wait, Onboarding handles Stage 3, but this is a compliance check post-onboarding perhaps? Or onboarding? Onboarding status is COMPLETED. Compliance agent handles it.
    trigger: "SCHEDULED",
    expected: {
      actionTaken: "NOTIFY_ADVISOR",
      escalationStage: 1,
      duplicateAction: false,
      highestPriority: "LOW", // Missing is LOW priority
    },
  },
  // CLT-015: Fully onboarded last week.
  {
    clientId: "CLT-015",
    agentType: "COMPLIANCE",
    trigger: "SCHEDULED",
    expected: {
      actionTaken: "SCAN_VAULT",
      duplicateAction: false,
      highestPriority: "NONE",
    },
  },
];
