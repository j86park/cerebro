import { z } from "zod";

/**
 * Kind of trajectory fixture in the $0 CI bank.
 * - golden-pass: approved / GROUND_TRUTH-aligned path that must score 1.0
 * - seeded-defect: intentional invariant violation for hard-scorer recall
 */
export const trajectoryFixtureKindSchema = z.enum([
  "golden-pass",
  "seeded-defect",
]);

export type TrajectoryFixtureKind = z.infer<typeof trajectoryFixtureKindSchema>;

/**
 * Versioned trajectory fixture consumed by Vitest without an agent or OpenRouter.
 */
export const trajectoryFixtureSchema = z.object({
  /** Stable id matching the JSON filename stem (e.g. clt-003-pass). */
  fixtureId: z.string().min(1),
  /** CLT id / GROUND_TRUTH clientId. */
  scenarioId: z.string().min(1),
  kind: trajectoryFixtureKindSchema,
  /** Observed tool-call names in order (Mastra / AI SDK trajectory). */
  toolNames: z.array(z.string().min(1)),
  /**
   * sha256 of canonical `{ scenarioId, toolNames }`.
   * Hash miss → replay outcome `diverged` (never vacuous pass).
   */
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  /** Optional DEMO_DATE stamp for audit (fixtures use env.DEMO_DATE at score time). */
  demoDate: z.string().datetime().optional(),
  /** Human-readable note (why this fixture exists). */
  note: z.string().optional(),
});

export type TrajectoryFixture = z.infer<typeof trajectoryFixtureSchema>;

/**
 * Three-outcome ReplayGate-style result for fixture / cassette replay.
 * REGULATORY: `diverged` must never be treated as pass.
 */
export const fixtureReplayOutcomeSchema = z.enum(["pass", "fail", "diverged"]);

export type FixtureReplayOutcome = z.infer<typeof fixtureReplayOutcomeSchema>;

export const fixtureReplayResultSchema = z.object({
  outcome: fixtureReplayOutcomeSchema,
  score: z.number().min(0).max(1).optional(),
  reason: z.string(),
  fixtureId: z.string().optional(),
  scenarioId: z.string().optional(),
});

export type FixtureReplayResult = z.infer<typeof fixtureReplayResultSchema>;
