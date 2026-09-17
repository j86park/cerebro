import { describe, expect, it } from "vitest";
import {
  buildEvalRunMetadata,
  shouldEscalateJudgeVerdict,
  shouldRunSoftJudgeForPassKTrial,
} from "@/evals/judge-routing";
import {
  assertEvalBudget,
  buildLiveEvalSessionId,
  getModelId,
  isPinnedOpenRouterModelId,
} from "@/lib/config";

describe("judge routing + stamps (cheap-eval PR3)", () => {
  it("pins AUT on dev and exposes evalJudge model ids via getModelId", () => {
    expect(getModelId("dev").length).toBeGreaterThan(0);
    expect(getModelId("evalJudge").length).toBeGreaterThan(0);
    expect(isPinnedOpenRouterModelId("openrouter/auto")).toBe(false);
    expect(isPinnedOpenRouterModelId("moonshotai/kimi-k2")).toBe(true);
  });

  it("builds sticky live session ids for OpenRouter prefix caching", () => {
    expect(buildLiveEvalSessionId("canary/abc")).toBe(
      "cerebro-eval-canary-abc"
    );
  });

  it("runs soft judge only on trial 0 under full mode; never under canary-ci", () => {
    expect(shouldRunSoftJudgeForPassKTrial(0, "full")).toBe(true);
    expect(shouldRunSoftJudgeForPassKTrial(1, "full")).toBe(false);
    expect(shouldRunSoftJudgeForPassKTrial(0, "canary-ci")).toBe(false);
  });

  it("does not escalate clear soft fail when cascade is off (default)", () => {
    expect(
      shouldEscalateJudgeVerdict({
        score: 0.2,
        verdict: "fail",
        reason: "generic",
      })
    ).toBe(false);
    expect(
      shouldEscalateJudgeVerdict({
        score: 0.9,
        verdict: "NEEDS_REVIEW",
        reason: "thin",
      })
    ).toBe(false);
  });

  it("stamps EvalRun metadata with AUT=dev and judge=evalJudge", () => {
    const meta = buildEvalRunMetadata({
      suite: { mode: "canary" },
      mode: "canary-ci",
      isFinal: true,
      liveSessionId: "canary-local",
      spendUsd: 0,
    });
    expect(meta.models.autTier).toBe("dev");
    expect(meta.models.judgeTier).toBe("evalJudge");
    expect(meta.models.autModelId).toBe(getModelId("dev"));
    expect(meta.models.judgeModelId).toBe(getModelId("evalJudge"));
    expect(meta.cost.spendUsd).toBe(0);
    expect(meta.suiteMode).toBe("canary");
  });

  it("assertEvalBudget no-ops when EVAL_BUDGET_USD is 0", () => {
    expect(() => assertEvalBudget(999)).not.toThrow();
  });
});
