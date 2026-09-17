import { beforeEach, describe, expect, it, vi } from "vitest";

const generateText = vi.fn();
const getModel = vi.fn(() => "primary-judge");
const getEvalJudgeEscalateModel = vi.fn(() => "escalate-judge");
const isEvalJudgeCascadeEnabled = vi.fn(() => true);
const recordCascadeEscalation = vi.fn();

vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => generateText(...args),
}));

vi.mock("@/lib/config", () => ({
  getModel: () => getModel(),
  getModelId: () => "primary-id",
  getEvalJudgeEscalateModelId: () => "escalate-id",
  getEvalJudgeEscalateModel: () => getEvalJudgeEscalateModel(),
  isEvalJudgeCascadeEnabled: () => isEvalJudgeCascadeEnabled(),
  env: {
    EVAL_JUDGE_CACHE: true,
    DEMO_DATE: "2025-03-20T12:00:00.000Z",
  },
}));

vi.mock("@/evals/judge-routing", async () => {
  const actual = await vi.importActual<typeof import("@/evals/judge-routing")>(
    "@/evals/judge-routing"
  );
  return {
    ...actual,
    recordCascadeEscalation: () => recordCascadeEscalation(),
    shouldEscalateJudgeVerdict: actual.shouldEscalateJudgeVerdict,
  };
});

describe("judge cascade Pilot (cheap-eval PR3)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    isEvalJudgeCascadeEnabled.mockReturnValue(true);
    getEvalJudgeEscalateModel.mockReturnValue("escalate-judge");
    const { clearJudgeCache } = await import("@/evals/judge-cache");
    clearJudgeCache();
    // Fresh module state for in-flight map
    vi.resetModules();
  });

  it("escalates on NEEDS_REVIEW to the config escalate model", async () => {
    generateText
      .mockResolvedValueOnce({
        text: JSON.stringify({
          score: 0.5,
          verdict: "NEEDS_REVIEW",
          reason: "thin evidence",
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          score: 0.9,
          verdict: "pass",
          reason: "escalated clear pass",
        }),
      });

    const { judgeReasoningQuality } = await import(
      "@/evals/scorers/reasoningQuality"
    );
    const { shouldEscalateJudgeVerdict } = await import(
      "@/evals/judge-routing"
    );

    expect(
      shouldEscalateJudgeVerdict({
        score: 0.5,
        verdict: "NEEDS_REVIEW",
        reason: "thin",
      })
    ).toBe(true);

    // Force cascade path via mocked isEvalJudgeCascadeEnabled
    const { isEvalJudgeCascadeEnabled: cascadeOn } = await import(
      "@/lib/config"
    );
    expect(cascadeOn()).toBe(true);

    const verdict = await judgeReasoningQuality(
      "Ambiguous reasoning needing cascade"
    );
    expect(generateText).toHaveBeenCalledTimes(2);
    expect(generateText.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ model: "primary-judge" })
    );
    expect(generateText.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({ model: "escalate-judge" })
    );
    expect(verdict?.verdict).toBe("pass");
    expect(recordCascadeEscalation).toHaveBeenCalled();
  });
});
