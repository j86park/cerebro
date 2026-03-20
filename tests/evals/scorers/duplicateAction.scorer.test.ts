import { describe, expect, it } from "vitest";
import { duplicateActionScorer } from "@/evals/scorers/duplicateAction";

describe("duplicateActionScorer", () => {
  it("scores 1 when duplicate expected and cooldown language present", async () => {
    const res = await duplicateActionScorer.run({
      output: { text: "Cannot act: cooldown period applies" },
      groundTruth: { duplicateAction: true },
    } as never);
    expect(res.score).toBe(1);
  });

  it("scores 0 when duplicate expected but no cooldown language", async () => {
    const res = await duplicateActionScorer.run({
      output: { text: "Sending another reminder now." },
      groundTruth: { duplicateAction: true },
    } as never);
    expect(res.score).toBe(0);
  });
});
