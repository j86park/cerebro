import { createHash } from "node:crypto";
import { z } from "zod";
import {
  fixtureReplayOutcomeSchema,
  type FixtureReplayOutcome,
} from "./schemas";

/**
 * Frozen-trace fixture: decision-level replay beyond tool-name trajectories.
 * SOTA P2.4 watch — CI ship gate remains Vitest fixtures; this extends hash + outcome checks.
 */
export const frozenTraceDecisionSchema = z.object({
  toolExecuted: z.string().min(1).nullable(),
  outcome: z.enum([
    "executed",
    "blocked",
    "dry_run",
    "needs_approval",
    "failed",
    "skipped",
  ]),
  refusalCodes: z.array(z.string()).default([]),
});

export type FrozenTraceDecision = z.infer<typeof frozenTraceDecisionSchema>;

export const frozenTraceFixtureSchema = z.object({
  fixtureId: z.string().min(1),
  jobId: z.string().min(1),
  traceId: z.string().min(1),
  toolExecuted: z.array(z.string().min(1)),
  decisionOutcomes: z.array(frozenTraceDecisionSchema).min(1),
  /**
   * sha256 of canonical `{ jobId, toolExecuted, decisionOutcomes }`.
   * Hash miss → diverged (never vacuous pass).
   */
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  note: z.string().optional(),
});

export type FrozenTraceFixture = z.infer<typeof frozenTraceFixtureSchema>;

export const frozenTraceReplayResultSchema = z.object({
  outcome: fixtureReplayOutcomeSchema,
  reason: z.string().min(1),
  fixtureId: z.string().min(1),
});

export type FrozenTraceReplayResult = z.infer<
  typeof frozenTraceReplayResultSchema
>;

const hashPayloadSchema = z.object({
  jobId: z.string().min(1),
  toolExecuted: z.array(z.string()),
  decisionOutcomes: z.array(frozenTraceDecisionSchema),
});

/**
 * Canonical sha256 for a frozen-trace fixture payload.
 */
export function hashFrozenTraceContent(input: {
  jobId: string;
  toolExecuted: string[];
  decisionOutcomes: FrozenTraceDecision[];
}): string {
  const parsed = hashPayloadSchema.parse(input);
  const canonical = JSON.stringify({
    jobId: parsed.jobId,
    toolExecuted: parsed.toolExecuted,
    decisionOutcomes: parsed.decisionOutcomes,
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/**
 * Replays a frozen-trace fixture in-memory (no DB / OpenRouter).
 * - pass — hash ok and no failed/blocked outcomes with refusal
 * - fail — hash ok but a decision outcome is `failed`
 * - diverged — hash miss or empty decisions
 */
export function replayFrozenTrace(
  fixture: FrozenTraceFixture,
): FrozenTraceReplayResult {
  const parsed = frozenTraceFixtureSchema.parse(fixture);

  const expectedHash = hashFrozenTraceContent({
    jobId: parsed.jobId,
    toolExecuted: parsed.toolExecuted,
    decisionOutcomes: parsed.decisionOutcomes,
  });

  if (parsed.contentHash !== expectedHash) {
    return {
      outcome: "diverged" satisfies FixtureReplayOutcome,
      fixtureId: parsed.fixtureId,
      reason: `Content hash mismatch for ${parsed.fixtureId}: fixture=${parsed.contentHash.slice(0, 12)}… expected=${expectedHash.slice(0, 12)}…`,
    };
  }

  const toolsFromDecisions = parsed.decisionOutcomes
    .map((d) => d.toolExecuted)
    .filter((t): t is string => t !== null);

  for (const tool of toolsFromDecisions) {
    if (!parsed.toolExecuted.includes(tool)) {
      return {
        outcome: "diverged",
        fixtureId: parsed.fixtureId,
        reason: `Decision toolExecuted "${tool}" not listed in toolExecuted[]`,
      };
    }
  }

  const failed = parsed.decisionOutcomes.find((d) => d.outcome === "failed");
  if (failed) {
    return {
      outcome: "fail",
      fixtureId: parsed.fixtureId,
      reason: `Frozen trace has failed decision (tool=${failed.toolExecuted ?? "none"})`,
    };
  }

  return {
    outcome: "pass",
    fixtureId: parsed.fixtureId,
    reason: "Frozen-trace hash and decision outcomes match",
  };
}
