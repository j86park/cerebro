import { createScorer } from "@mastra/core/evals";
import type { ExpectedOutcome } from "../ground-truth";
import { extractToolNamesFromOutput } from "./extract-tool-names";
import { scoreTrajectory } from "./score-trajectory";

/**
 * Deterministic trajectory scorer (Mastra agent-vs-trajectory style).
 * REGULATORY: wrong tool path with lucky outcome must hard-fail.
 */
export const trajectoryScorer = createScorer({
  id: "trajectoryScorer",
  description:
    "Verifies expected/forbidden tools and step budget against the scenario trajectory golden.",
})
  .generateScore(async ({ run }) => {
    const expected = run.groundTruth as ExpectedOutcome | undefined;
    const tools = extractToolNamesFromOutput(run.output);
    return scoreTrajectory(tools, expected?.trajectory).score;
  })
  .generateReason(async ({ run }) => {
    const expected = run.groundTruth as ExpectedOutcome | undefined;
    const tools = extractToolNamesFromOutput(run.output);
    return scoreTrajectory(tools, expected?.trajectory).reason;
  });
