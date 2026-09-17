import { GROUND_TRUTH } from "@/evals/ground-truth";
import { scoreTrajectory } from "@/evals/scorers/score-trajectory";
import { hashTrajectoryFixtureContent } from "./hash";
import type { FixtureReplayResult, TrajectoryFixture } from "./schemas";

/**
 * Replays a trajectory fixture against GROUND_TRUTH with three-outcome semantics:
 * - pass — hash ok and hard trajectory score is 1.0
 * - fail — hash ok and hard trajectory score is 0.0
 * - diverged — missing golden, hash miss, or scorer N/A (never vacuous pass)
 */
export function replayTrajectoryFixture(
  fixture: TrajectoryFixture
): FixtureReplayResult {
  const scenario = GROUND_TRUTH.find((s) => s.clientId === fixture.scenarioId);
  if (!scenario) {
    return {
      outcome: "diverged",
      fixtureId: fixture.fixtureId,
      scenarioId: fixture.scenarioId,
      reason: `No GROUND_TRUTH scenario for ${fixture.scenarioId}`,
    };
  }

  const golden = scenario.expected.trajectory;
  if (!golden) {
    return {
      outcome: "diverged",
      fixtureId: fixture.fixtureId,
      scenarioId: fixture.scenarioId,
      reason: `GROUND_TRUTH ${fixture.scenarioId} has no trajectory golden — cannot grade fixture`,
    };
  }

  const expectedHash = hashTrajectoryFixtureContent(
    fixture.scenarioId,
    fixture.toolNames
  );
  if (fixture.contentHash !== expectedHash) {
    return {
      outcome: "diverged",
      fixtureId: fixture.fixtureId,
      scenarioId: fixture.scenarioId,
      reason: `Content hash mismatch for ${fixture.fixtureId}: fixture=${fixture.contentHash.slice(0, 12)}… expected=${expectedHash.slice(0, 12)}… (treat as diverged, not pass)`,
    };
  }

  const scored = scoreTrajectory(fixture.toolNames, golden);
  if (scored.score >= 1) {
    return {
      outcome: "pass",
      score: scored.score,
      reason: scored.reason,
      fixtureId: fixture.fixtureId,
      scenarioId: fixture.scenarioId,
    };
  }

  return {
    outcome: "fail",
    score: scored.score,
    reason: scored.reason,
    fixtureId: fixture.fixtureId,
    scenarioId: fixture.scenarioId,
  };
}

/**
 * Asserts fixture kind matches replay outcome for the $0 CI bank.
 * golden-pass → pass; seeded-defect → fail; anything else is a suite bug.
 */
export function assertFixtureKindMatchesReplay(
  fixture: TrajectoryFixture,
  result: FixtureReplayResult
): void {
  if (result.outcome === "diverged") {
    throw new Error(
      `Fixture ${fixture.fixtureId} diverged (not a scorer fail): ${result.reason}`
    );
  }

  if (fixture.kind === "golden-pass" && result.outcome !== "pass") {
    throw new Error(
      `golden-pass fixture ${fixture.fixtureId} expected pass, got ${result.outcome}: ${result.reason}`
    );
  }

  if (fixture.kind === "seeded-defect" && result.outcome !== "fail") {
    throw new Error(
      `seeded-defect fixture ${fixture.fixtureId} expected fail (scorer recall), got ${result.outcome}: ${result.reason}`
    );
  }
}
