import { z } from "zod";
import {
  failureCandidateSchema,
  type FailureCandidate,
  type FailureSnapshot,
  type GoldenScenarioBody,
} from "./schemas";
import { extractToolNamesFromOutput } from "@/evals/scorers/extract-tool-names";
import { env } from "@/lib/config";

/** Minimal eval row shape for mining — avoids circular import with `run.ts`. */
export type MineableEvalRow = {
  agent: string;
  output?: string;
  error?: string;
  scores: Record<string, { score?: number; reason?: string }>;
  toolNames?: string[];
};

const exportFromEvalRowInputSchema = z.object({
  evalRunId: z.string().min(1),
  clientId: z.string().min(1),
  agentType: z.enum(["COMPLIANCE", "ONBOARDING"]),
  row: z.custom<MineableEvalRow>(),
  /** Optional draft overrides (human / operator may pre-fill expected trajectory). */
  draftScenario: z.custom<GoldenScenarioBody>().optional(),
  notes: z.string().optional(),
  candidateId: z.string().min(1).optional(),
  minedAt: z.string().datetime().optional(),
});

export type ExportFromEvalRowInput = z.infer<typeof exportFromEvalRowInputSchema>;

/**
 * Builds a failure snapshot from a persisted (or in-memory) ScenarioEvalRow.
 */
export function buildFailureSnapshotFromEvalRow(
  row: MineableEvalRow,
  endState?: FailureSnapshot["endState"]
): FailureSnapshot {
  const toolNames =
    row.toolNames && row.toolNames.length > 0
      ? row.toolNames
      : extractToolNamesFromOutput(row.output ?? "");

  return {
    toolNames,
    outputText: row.output,
    error: row.error,
    scores: row.scores,
    endState,
  };
}

/**
 * Drafts a scenario body that encodes the *correct* expected path for a failure.
 * Default: treat observed tools as forbidden (lucky-path / wrong-tool regression)
 * so a promoted golden hard-fails until the agent is fixed.
 *
 * REGULATORY: human must review before approve — this is a starting draft only.
 */
export function draftScenarioFromFailure(params: {
  clientId: string;
  agentType: "COMPLIANCE" | "ONBOARDING";
  toolNames: string[];
  canary?: boolean;
}): GoldenScenarioBody {
  const forbiddenTools = [...new Set(params.toolNames)].filter(Boolean);
  return {
    clientId: params.clientId,
    agentType: params.agentType,
    trigger: "SCHEDULED",
    canary: params.canary ?? true,
    expected: {
      // Placeholder outcome — human must confirm REGULATORY correctness on approve.
      actionTaken:
        params.agentType === "ONBOARDING" ? "REQUEST_DOCUMENT" : "SCAN_VAULT",
      duplicateAction: false,
      trajectory: {
        // Force a constraint so trajectory golden is valid even if tool list empty.
        forbiddenTools:
          forbiddenTools.length > 0
            ? forbiddenTools
            : ["escalateToManagement", "completeOnboarding"],
        maxSteps: 12,
      },
    },
  };
}

/**
 * Mines a pending failure candidate from an EvalRun scenario row.
 * Does not write disk — caller persists via `writeFailureCandidate`.
 */
export function exportFailureCandidateFromEvalRow(
  input: ExportFromEvalRowInput
): FailureCandidate {
  const parsed = exportFromEvalRowInputSchema.parse(input);
  const snapshot = buildFailureSnapshotFromEvalRow(parsed.row);
  const draft =
    parsed.draftScenario ??
    draftScenarioFromFailure({
      clientId: parsed.clientId,
      agentType: parsed.agentType,
      toolNames: snapshot.toolNames,
      canary: true,
    });

  const minedAt = parsed.minedAt ?? env.DEMO_DATE;
  const candidateId =
    parsed.candidateId ??
    `cand-${parsed.evalRunId.slice(0, 8)}-${parsed.clientId}`;

  return failureCandidateSchema.parse({
    candidateId,
    approvalStatus: "pending",
    source: {
      evalRunId: parsed.evalRunId,
      clientId: parsed.clientId,
      minedAt,
    },
    draftScenario: draft,
    failureSnapshot: snapshot,
    notes: parsed.notes,
    regulatoryReviewRequired: true,
  });
}

const syntheticFailureInputSchema = z.object({
  candidateId: z.string().min(1),
  clientId: z.string().min(1),
  agentType: z.enum(["COMPLIANCE", "ONBOARDING"]),
  /** Observed (wrong) tool path from the failing run. */
  observedToolNames: z.array(z.string().min(1)).min(1),
  /** Correct expected scenario after human review — optional draft default. */
  draftScenario: z.custom<GoldenScenarioBody>().optional(),
  scores: z
    .record(
      z.string(),
      z.object({ score: z.number().optional(), reason: z.string().optional() })
    )
    .optional(),
  notes: z.string().optional(),
  minedAt: z.string().datetime().optional(),
});

export type SyntheticFailureInput = z.infer<typeof syntheticFailureInputSchema>;

/**
 * Builds a synthetic failure candidate (for DRY_RUN / unit tests without DB).
 */
export function exportSyntheticFailureCandidate(
  input: SyntheticFailureInput
): FailureCandidate {
  const parsed = syntheticFailureInputSchema.parse(input);
  const draft =
    parsed.draftScenario ??
    draftScenarioFromFailure({
      clientId: parsed.clientId,
      agentType: parsed.agentType,
      toolNames: parsed.observedToolNames,
      canary: true,
    });

  return failureCandidateSchema.parse({
    candidateId: parsed.candidateId,
    approvalStatus: "pending",
    source: {
      clientId: parsed.clientId,
      minedAt: parsed.minedAt ?? env.DEMO_DATE,
    },
    draftScenario: draft,
    failureSnapshot: {
      toolNames: parsed.observedToolNames,
      scores: parsed.scores ?? {
        trajectoryScorer: {
          score: 0,
          reason: "Synthetic forbidden-tool / lucky-path failure",
        },
      },
    },
    notes: parsed.notes ?? "Synthetic failure for golden promotion tests",
    regulatoryReviewRequired: true,
  });
}
