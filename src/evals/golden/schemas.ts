import { z } from "zod";
import { ActionType, AgentType, TriggerType } from "@/lib/db/enums";
import { trajectoryGoldenSchema } from "@/evals/trajectory-golden";

const actionTypeSchema = z.enum(
  Object.keys(ActionType) as [keyof typeof ActionType, ...(keyof typeof ActionType)[]]
);
const agentTypeSchema = z.enum(
  Object.keys(AgentType) as [keyof typeof AgentType, ...(keyof typeof AgentType)[]]
);
const triggerTypeSchema = z.enum(
  Object.keys(TriggerType) as [keyof typeof TriggerType, ...(keyof typeof TriggerType)[]]
);

/**
 * Expected outcome shape for a golden / candidate scenario (Zod mirror of EvalScenario.expected).
 */
export const expectedOutcomeSchema = z.object({
  actionTaken: actionTypeSchema,
  escalationStage: z.number().int().min(0).max(10).optional(),
  duplicateAction: z.boolean(),
  highestPriority: z
    .enum(["CRITICAL", "HIGH", "MEDIUM", "LOW", "NONE"])
    .optional(),
  onboardingStage: z.number().int().min(0).max(10).optional(),
  trajectory: trajectoryGoldenSchema.optional(),
});

/**
 * Scenario body persisted in golden JSON (subset of GROUND_TRUTH EvalScenario).
 */
export const goldenScenarioBodySchema = z.object({
  clientId: z.string().min(1),
  agentType: agentTypeSchema,
  trigger: triggerTypeSchema,
  expected: expectedOutcomeSchema,
  /** When true, hard canary gates apply after approval into the ship suite. */
  canary: z.boolean().optional(),
  /**
   * Stratified canary failure mode (required when promoting into hard-gate canaries).
   * Validated at canary-list time when `canary: true` on GROUND_TRUTH.
   */
  stratum: z
    .enum([
      "onboarding_day1",
      "escalation_ladder",
      "compliant_forbidden_tools",
      "stuck_onboarding",
      "duplicate_action",
      "document_priority",
      "other",
    ])
    .optional(),
  sourceIncidentId: z.string().min(1).optional(),
});

export type GoldenScenarioBody = z.infer<typeof goldenScenarioBodySchema>;

/**
 * Observed failure snapshot mined from EvalRun / ShadowRun / synthetic fixtures.
 */
export const failureSnapshotSchema = z.object({
  toolNames: z.array(z.string()),
  outputText: z.string().optional(),
  error: z.string().optional(),
  scores: z.record(
    z.string(),
    z.object({
      score: z.number().optional(),
      reason: z.string().optional(),
    })
  ),
  /** Optional vault end-state (docs + recent actions) at capture time. */
  endState: z
    .object({
      documentStatuses: z
        .array(
          z.object({
            id: z.string().optional(),
            type: z.string().optional(),
            status: z.string().optional(),
          })
        )
        .optional(),
      recentActions: z
        .array(
          z.object({
            actionType: z.string().optional(),
            reasoning: z.string().optional(),
            outcome: z.string().optional(),
          })
        )
        .optional(),
    })
    .optional(),
});

export type FailureSnapshot = z.infer<typeof failureSnapshotSchema>;

export const goldenSourceSchema = z.object({
  evalRunId: z.string().min(1).optional(),
  shadowRunResultId: z.string().min(1).optional(),
  clientId: z.string().min(1),
  minedAt: z.string().datetime(),
});

/**
 * Pending failure candidate — lives under candidates/ and NEVER enters the ship gate.
 */
export const failureCandidateSchema = z.object({
  candidateId: z.string().min(1),
  approvalStatus: z.literal("pending"),
  source: goldenSourceSchema,
  /** Draft scenario the human may edit before approve. */
  draftScenario: goldenScenarioBodySchema,
  failureSnapshot: failureSnapshotSchema,
  notes: z.string().optional(),
  /**
   * REGULATORY: when true, human must confirm expectations encode correct
   * regulatory behavior before approve writes an approved golden.
   */
  regulatoryReviewRequired: z.boolean().default(true),
});

export type FailureCandidate = z.infer<typeof failureCandidateSchema>;

/**
 * Human-approved, versioned golden scenario JSON — only these load into the offline ship suite.
 * Append-only: never mutate an existing version file; bump version instead.
 */
export const approvedGoldenSchema = z.object({
  scenarioId: z.string().min(1),
  version: z.number().int().positive(),
  approved: z.literal(true),
  approvedAt: z.string().datetime(),
  approvedBy: z.string().min(1),
  source: goldenSourceSchema,
  scenario: goldenScenarioBodySchema,
  failureSnapshot: failureSnapshotSchema.optional(),
  /** REGULATORY: lessons stay append-only elsewhere; golden promote never mutates lesson text. */
  regulatoryConfirmed: z.boolean(),
  candidateId: z.string().min(1).optional(),
});

export type ApprovedGolden = z.infer<typeof approvedGoldenSchema>;

/**
 * Manifest of approved golden file basenames that may enter the ship gate.
 * Loader requires both `approved: true` on the file AND presence in this manifest.
 */
export const approvedGoldenManifestSchema = z.object({
  /** Relative filenames under the approved/ directory, e.g. "GOLD-SYN-001.v1.json". */
  files: z.array(z.string().min(1)),
  updatedAt: z.string().datetime().optional(),
});

export type ApprovedGoldenManifest = z.infer<typeof approvedGoldenManifestSchema>;
