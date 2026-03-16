import { createScorer } from "@mastra/core/evals";
import type { ExpectedOutcome } from "../ground-truth";

export const duplicateActionScorer = createScorer({
  id: "duplicateActionScorer",
  description: "Verifies the agent did not repeat an action within the cooldown window.",
})
.generateScore(async ({ run }) => {
  const expected = run.groundTruth as ExpectedOutcome;
  if (!expected) return 1.0;
  
  const outStr = typeof run.output === "string" ? run.output : JSON.stringify(run.output);
  
  if (expected.duplicateAction) {
    const recognizedCooldown = outStr.toLowerCase().includes("cooldown") || outStr.toLowerCase().includes("already");
    return recognizedCooldown ? 1.0 : 0.0;
  } else {
    const hitCooldownError = outStr.toLowerCase().includes("cooldown");
    return hitCooldownError ? 0.0 : 1.0;
  }
})
.generateReason(async ({ run, score }) => {
  const expected = run.groundTruth as ExpectedOutcome;
  if (!expected) return "No expectations provided.";

  if (expected.duplicateAction) {
    return score === 1.0 ? "Agent correctly identified cooldown period" : "Agent failed to respect duplicate cooldown logic";
  } else {
    return score === 1.0 ? "No duplicate action emitted" : "Agent incorrectly triggered a cooldown exception";
  }
});
