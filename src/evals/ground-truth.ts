import { ActionType, AgentType, TriggerType } from "@/lib/db/enums";
import type { CanaryStratum } from "./canary-strata";
import type { TrajectoryGolden } from "./trajectory-golden";
import {
  FORBIDDEN_COMPLIANCE_SIDE_EFFECTS,
  FORBIDDEN_ESCALATION_TOOLS,
  FORBIDDEN_ONBOARDING_SIDE_EFFECTS,
  OBSERVE_COMPLIANCE,
  OBSERVE_ONBOARDING,
  OBSERVE_SHARED,
} from "./trajectory-golden";

export type ExpectedOutcome = {
  actionTaken: keyof typeof ActionType;
  escalationStage?: number;
  duplicateAction: boolean;
  highestPriority?: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "NONE";
  onboardingStage?: number;
  /**
   * Tool-path golden. When present, `trajectoryScorer` hard-fails wrong tools
   * even if the outcome action/stage looks correct.
   */
  trajectory?: TrajectoryGolden;
};

export type EvalScenario = {
  clientId: string;
  agentType: keyof typeof AgentType;
  trigger: keyof typeof TriggerType;
  expected: ExpectedOutcome;
  /** Regression gate: deterministic scenarios that must stay at 100% pass rate after prompt mutations. */
  canary?: boolean;
  /**
   * Stratified canary failure mode (required when `canary: true`).
   * Used to keep the canary partition diverse — not uniform “first N”.
   */
  stratum?: CanaryStratum;
  /** Optional incident / failure id that seeded this canary. */
  sourceIncidentId?: string;
};

export const GROUND_TRUTH: EvalScenario[] = [
  // CLT-001: Brand new TFSA client, Day 1. No docs.
  {
    clientId: "CLT-001",
    canary: true,
    stratum: "onboarding_day1",
    agentType: "ONBOARDING",
    trigger: "SCHEDULED",
    expected: {
      actionTaken: "REQUEST_DOCUMENT",
      onboardingStage: 1,
      duplicateAction: false,
      trajectory: {
        expectedTools: [...OBSERVE_ONBOARDING, "requestDocument"],
        expectedToolSequence: ["getOnboardingStatus", "requestDocument"],
        forbiddenTools: [...FORBIDDEN_COMPLIANCE_SIDE_EFFECTS],
        maxSteps: 12,
      },
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
      trajectory: {
        expectedTools: [...OBSERVE_COMPLIANCE],
        forbiddenTools: [
          "escalateToManagement",
          "escalateToComplianceOfficer",
          ...FORBIDDEN_ONBOARDING_SIDE_EFFECTS,
        ],
        maxSteps: 10,
      },
    },
  },
  // CLT-003: KYC expired 60 days ago, full escalation history. Due today.
  {
    clientId: "CLT-003",
    canary: true,
    stratum: "escalation_ladder",
    agentType: "COMPLIANCE",
    trigger: "SCHEDULED",
    expected: {
      actionTaken: "ESCALATE_MANAGEMENT", // Stage 5
      escalationStage: 5,
      duplicateAction: false,
      highestPriority: "CRITICAL",
      trajectory: {
        expectedTools: [...OBSERVE_COMPLIANCE, "escalateToManagement"],
        expectedToolSequence: [
          "getDocumentComplianceStatus",
          "escalateToManagement",
        ],
        forbiddenTools: [...FORBIDDEN_ONBOARDING_SIDE_EFFECTS],
        maxSteps: 12,
      },
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
      trajectory: {
        expectedTools: [...OBSERVE_ONBOARDING, "alertAdvisorStuck"],
        forbiddenTools: [...FORBIDDEN_COMPLIANCE_SIDE_EFFECTS, "completeOnboarding"],
        maxSteps: 12,
      },
    },
  },
  // CLT-005: Fully compliant.
  {
    clientId: "CLT-005",
    canary: true,
    stratum: "compliant_forbidden_tools",
    agentType: "COMPLIANCE",
    trigger: "SCHEDULED",
    expected: {
      actionTaken: "SCAN_VAULT",
      duplicateAction: false,
      highestPriority: "NONE",
      trajectory: {
        expectedTools: [...OBSERVE_SHARED, ...OBSERVE_COMPLIANCE],
        forbiddenTools: [
          ...FORBIDDEN_ESCALATION_TOOLS,
          ...FORBIDDEN_ONBOARDING_SIDE_EFFECTS,
        ],
        maxSteps: 10,
      },
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
      trajectory: {
        expectedTools: [...OBSERVE_COMPLIANCE, "sendAdvisorAlert"],
        forbiddenTools: [
          "escalateToManagement",
          "escalateToComplianceOfficer",
          ...FORBIDDEN_ONBOARDING_SIDE_EFFECTS,
        ],
        maxSteps: 12,
      },
    },
  },
  // CLT-007: Multiple docs expiring within 14 days (AML +8d → MEDIUM; none ≤7d).
  {
    clientId: "CLT-007",
    agentType: "COMPLIANCE",
    trigger: "SCHEDULED",
    expected: {
      actionTaken: "NOTIFY_ADVISOR",
      escalationStage: 1,
      duplicateAction: false,
      highestPriority: "MEDIUM",
      trajectory: {
        expectedTools: [...OBSERVE_COMPLIANCE, "sendAdvisorAlert"],
        forbiddenTools: [
          "escalateToManagement",
          "escalateToComplianceOfficer",
          ...FORBIDDEN_ONBOARDING_SIDE_EFFECTS,
        ],
        maxSteps: 12,
      },
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
      trajectory: {
        expectedTools: [...OBSERVE_COMPLIANCE, "sendAdvisorAlert"],
        forbiddenTools: [
          "escalateToManagement",
          "escalateToComplianceOfficer",
          ...FORBIDDEN_ONBOARDING_SIDE_EFFECTS,
        ],
        maxSteps: 12,
      },
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
      trajectory: {
        expectedTools: [...OBSERVE_ONBOARDING, "alertAdvisorStuck"],
        forbiddenTools: [
          ...FORBIDDEN_COMPLIANCE_SIDE_EFFECTS,
          "completeOnboarding",
        ],
        maxSteps: 12,
      },
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
      duplicateAction: false, // Maybe requests PROOF_OF_ADDRESS
      trajectory: {
        expectedTools: [...OBSERVE_ONBOARDING, "requestDocument"],
        expectedToolSequence: ["getOnboardingStatus", "requestDocument"],
        forbiddenTools: [...FORBIDDEN_COMPLIANCE_SIDE_EFFECTS],
        maxSteps: 12,
      },
    },
  },
  // CLT-011: Escalation ladder — mock agent advances to compliance escalation from seeded history.
  {
    clientId: "CLT-011",
    agentType: "COMPLIANCE",
    trigger: "SCHEDULED",
    expected: {
      actionTaken: "ESCALATE_COMPLIANCE",
      escalationStage: 4,
      duplicateAction: false,
      highestPriority: "CRITICAL",
      trajectory: {
        expectedTools: [...OBSERVE_COMPLIANCE, "escalateToComplianceOfficer"],
        forbiddenTools: ["escalateToManagement", ...FORBIDDEN_ONBOARDING_SIDE_EFFECTS],
        maxSteps: 12,
      },
    },
  },
  // CLT-012: After upload, mock agent completes onboarding when all requirements are met.
  {
    clientId: "CLT-012",
    agentType: "ONBOARDING",
    trigger: "EVENT_UPLOAD",
    expected: {
      actionTaken: "COMPLETE_ONBOARDING",
      onboardingStage: 4,
      duplicateAction: false,
      trajectory: {
        expectedTools: [...OBSERVE_ONBOARDING, "completeOnboarding"],
        forbiddenTools: [...FORBIDDEN_COMPLIANCE_SIDE_EFFECTS],
        maxSteps: 12,
      },
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
      trajectory: {
        expectedTools: [...OBSERVE_COMPLIANCE, "sendAdvisorAlert"],
        forbiddenTools: [
          "escalateToManagement",
          "escalateToComplianceOfficer",
          ...FORBIDDEN_ONBOARDING_SIDE_EFFECTS,
        ],
        maxSteps: 12,
      },
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
  // CLT-016: Corporate HNW client, Articles of Incorporation missing.
  {
    clientId: "CLT-016",
    agentType: "COMPLIANCE",
    trigger: "SCHEDULED",
    expected: {
      actionTaken: "NOTIFY_ADVISOR",
      escalationStage: 1,
      duplicateAction: false,
      highestPriority: "MEDIUM",
    },
  },
  // CLT-017: Joint account, both identities missing.
  {
    clientId: "CLT-017",
    agentType: "ONBOARDING",
    trigger: "SCHEDULED",
    expected: {
      actionTaken: "REQUEST_DOCUMENT",
      onboardingStage: 1,
      duplicateAction: false,
    },
  },
  // CLT-018: Trust account, missing trust deed (high priority).
  {
    clientId: "CLT-018",
    agentType: "COMPLIANCE",
    trigger: "SCHEDULED",
    expected: {
      actionTaken: "ESCALATE_COMPLIANCE",
      escalationStage: 3,
      duplicateAction: false,
      highestPriority: "HIGH",
    },
  },
  // CLT-019: Corporate account, Signatory List expired.
  {
    clientId: "CLT-019",
    agentType: "COMPLIANCE",
    trigger: "SCHEDULED",
    expected: {
      actionTaken: "NOTIFY_ADVISOR",
      escalationStage: 1,
      duplicateAction: false,
      highestPriority: "CRITICAL",
    },
  },
  // CLT-020: Investment account, missing IPS (Investment Policy Statement).
  {
    clientId: "CLT-020",
    agentType: "COMPLIANCE",
    trigger: "SCHEDULED",
    expected: {
      actionTaken: "NOTIFY_ADVISOR",
      escalationStage: 1,
      duplicateAction: false,
      highestPriority: "MEDIUM",
    },
  },
  // CLT-021: Lapsed client, all documents expired (> 5 years).
  {
    clientId: "CLT-021",
    agentType: "COMPLIANCE",
    trigger: "SCHEDULED",
    expected: {
      actionTaken: "ESCALATE_MANAGEMENT",
      escalationStage: 5,
      duplicateAction: false,
      highestPriority: "CRITICAL",
    },
  },
  // CLT-022: New Individual account, NAAF document upload failed/invalid.
  {
    clientId: "CLT-022",
    agentType: "ONBOARDING",
    trigger: "EVENT_UPLOAD",
    expected: {
      actionTaken: "REQUEST_DOCUMENT", // Re-request after validation failure
      onboardingStage: 2,
      duplicateAction: false,
    },
  },
  // CLT-023: Corporate account, missing multiple critical docs.
  {
    clientId: "CLT-023",
    agentType: "COMPLIANCE",
    trigger: "SCHEDULED",
    expected: {
      actionTaken: "NOTIFY_ADVISOR",
      escalationStage: 1,
      duplicateAction: false,
      highestPriority: "CRITICAL",
    },
  },
  // CLT-024: Client in early onboarding stalled, no docs uploaded after 3 reminders.
  {
    clientId: "CLT-024",
    agentType: "ONBOARDING",
    trigger: "SCHEDULED",
    expected: {
      actionTaken: "ALERT_ADVISOR_STUCK",
      onboardingStage: 1,
      duplicateAction: false,
    },
  },
  // CLT-025: Corporate account, just uploaded Articles. Moving to next stage.
  {
    clientId: "CLT-025",
    agentType: "ONBOARDING",
    trigger: "EVENT_UPLOAD",
    expected: {
      actionTaken: "VALIDATE_DOCUMENT",
      onboardingStage: 2,
      duplicateAction: false,
      trajectory: {
        expectedTools: [
          ...OBSERVE_ONBOARDING,
          "validateDocumentReceived",
          "advanceOnboardingStage",
        ],
        expectedToolSequence: [
          "validateDocumentReceived",
          "advanceOnboardingStage",
        ],
        forbiddenTools: [...FORBIDDEN_COMPLIANCE_SIDE_EFFECTS],
        maxSteps: 12,
      },
    },
  },
  // CLT-026: Individual account, high-risk flag triggered by KYC answers.
  {
    clientId: "CLT-026",
    agentType: "COMPLIANCE",
    trigger: "SCHEDULED",
    expected: {
      actionTaken: "ESCALATE_COMPLIANCE",
      escalationStage: 3,
      duplicateAction: false,
      highestPriority: "HIGH",
    },
  },
  // CLT-027: Corporate account, missing UBO (Ultimate Beneficial Owner) info.
  {
    clientId: "CLT-027",
    agentType: "COMPLIANCE",
    trigger: "SCHEDULED",
    expected: {
      actionTaken: "NOTIFY_ADVISOR",
      escalationStage: 1,
      duplicateAction: false,
      highestPriority: "HIGH",
    },
  },
  // CLT-028: Joint account, onboarding completed but beneficiary missing.
  {
    clientId: "CLT-028",
    agentType: "COMPLIANCE",
    trigger: "SCHEDULED",
    expected: {
      actionTaken: "NOTIFY_ADVISOR",
      escalationStage: 1,
      duplicateAction: false,
      highestPriority: "LOW",
    },
  },
  // CLT-029: Individual account, proof of address expiring in 2 days.
  {
    clientId: "CLT-029",
    agentType: "COMPLIANCE",
    trigger: "SCHEDULED",
    expected: {
      actionTaken: "NOTIFY_ADVISOR", // Stage 1 Notify
      escalationStage: 1,
      duplicateAction: false,
      highestPriority: "HIGH",
    },
  },
  // CLT-030: Corporate account, all docs valid, annual review passed.
  {
    clientId: "CLT-030",
    agentType: "COMPLIANCE",
    trigger: "SCHEDULED",
    expected: {
      actionTaken: "SCAN_VAULT",
      duplicateAction: false,
      highestPriority: "NONE",
    },
  },
];

/** Client IDs used as the canary partition for mutation regression gates. */
export const CANARY_CLIENT_IDS = new Set<string>(
  GROUND_TRUTH.filter((g) => g.canary === true).map((g) => g.clientId)
);
