import { beforeEach, describe, expect, it } from "vitest";
import {
  buildJudgeCacheKey,
  clearJudgeCache,
  getCachedJudgeVerdict,
  getJudgeCacheStats,
  hashJudgeTrajectory,
  reasoningQualityCacheKeyParts,
  setCachedJudgeVerdict,
} from "@/evals/judge-cache";

describe("exact judge-result cache (cheap-eval PR3)", () => {
  beforeEach(() => {
    clearJudgeCache();
  });

  it("builds stable keys from fingerprint parts", () => {
    const parts = {
      promptVersion: "reasoning-quality-v1",
      toolsHash: "none",
      scenarioId: "CLT-003",
      trajectoryHash: hashJudgeTrajectory("same reasoning"),
      evalJudgeModelId: "moonshotai/kimi-k2|escalate:none",
      rubricVersion: "reasoning-quality-v1",
    };
    expect(buildJudgeCacheKey(parts)).toBe(buildJudgeCacheKey(parts));
    expect(buildJudgeCacheKey({ ...parts, scenarioId: "CLT-001" })).not.toBe(
      buildJudgeCacheKey(parts)
    );
  });

  it("write-through hits skip a second OpenRouter call path", () => {
    const key = buildJudgeCacheKey(
      reasoningQualityCacheKeyParts({
        reasoning: "CLT-003 KYC expired; escalate management.",
        scenarioId: "CLT-003",
      })
    );
    expect(getCachedJudgeVerdict(key)).toBeUndefined();
    setCachedJudgeVerdict(key, {
      score: 0.85,
      verdict: "pass",
      reason: "specific",
    });
    const hit = getCachedJudgeVerdict(key);
    expect(hit?.verdict.verdict).toBe("pass");
    expect(getJudgeCacheStats()).toMatchObject({
      hits: 1,
      misses: 1,
      writes: 1,
    });
  });

  it("does not semantic-match different reasoning", () => {
    const a = buildJudgeCacheKey(
      reasoningQualityCacheKeyParts({ reasoning: "exact A", scenarioId: "X" })
    );
    const b = buildJudgeCacheKey(
      reasoningQualityCacheKeyParts({
        reasoning: "exact A with paraphrase",
        scenarioId: "X",
      })
    );
    expect(a).not.toBe(b);
  });
});
