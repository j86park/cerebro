/**
 * Cheap-eval PR0: versioned trajectory fixtures for $0 Vitest CI.
 * Promote-golden approved scenarios may be copied here after human approval;
 * this bank is scored every PR without OpenRouter.
 */
export {
  hashTrajectoryFixtureContent,
} from "./hash";
export {
  loadAllTrajectoryFixtures,
  loadTrajectoryFixture,
  listTrajectoryFixtureIds,
} from "./load";
export {
  getTrajectoryFixturesDir,
  resolveTrajectoryFixturePath,
} from "./paths";
export {
  assertFixtureKindMatchesReplay,
  replayTrajectoryFixture,
} from "./replay";
export {
  fixtureReplayOutcomeSchema,
  fixtureReplayResultSchema,
  trajectoryFixtureKindSchema,
  trajectoryFixtureSchema,
  type FixtureReplayOutcome,
  type FixtureReplayResult,
  type TrajectoryFixture,
  type TrajectoryFixtureKind,
} from "./schemas";
