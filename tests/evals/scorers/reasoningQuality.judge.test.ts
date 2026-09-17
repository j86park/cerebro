import { beforeEach, describe, expect, it, vi } from "vitest";

const generateText = vi.fn();
const getModel = vi.fn((_tier?: string) => "mock-eval-judge-model");
const getEvalJudgeEscalateModel = vi.fn(() => null);
const isEvalJudgeCascadeEnabled = vi.fn(() => false);

vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => generateText(...args),
}));

vi.mock("@/lib/config", () => ({
  getModel: (tier: string) => getModel(tier),
  getModelId: (tier: string) => `mock-id-${tier}`,
  getEvalJudgeEscalateModelId: () => null,
  getEvalJudgeEscalateModel: () => getEvalJudgeEscalateModel(),
  isEvalJudgeCascadeEnabled: () => isEvalJudgeCascadeEnabled(),
  env: {
    EVAL_JUDGE_CACHE: true,
    DEMO_DATE: "2025-03-20T12:00:00.000Z",
  },
}));

describe("reasoningQualityScorer evalJudge pin + single call (PR3)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    getModel.mockReturnValue("mock-eval-judge-model");
    isEvalJudgeCascadeEnabled.mockReturnValue(false);
    getEvalJudgeEscalateModel.mockReturnValue(null);
    const { clearJudgeCache } = await import("@/evals/judge-cache");
    clearJudgeCache();
  });

  it('calls getModel("evalJudge") exclusively — never a hardcoded model string', async () => {
    generateText.mockResolvedValue({
      text: JSON.stringify({
        score: 0.9,
        verdict: "pass",
        reason: "specific and regulatory-aware",
      }),
    });

    const { reasoningQualityScorer } = await import(
      "@/evals/scorers/reasoningQuality"
    );

    const res = await reasoningQualityScorer.run({
      output: {
        toolCalls: [
          {
            name: "logAction",
            args: {
              reasoning:
                "CLT-003 KYC expired 60 days; escalate to management per ladder stage 5.",
            },
          },
        ],
      },
      groundTruth: {},
    } as never);

    expect(getModel).toHaveBeenCalled();
    const tiers = getModel.mock.calls.map((c) => c[0] as string);
    expect(tiers.every((t) => t === "evalJudge")).toBe(true);
    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({ model: "mock-eval-judge-model" })
    );
    expect(res.score).toBe(0.9);
  });

  it("dedupes generateScore + generateReason to one LLM call", async () => {
    generateText.mockResolvedValue({
      text: JSON.stringify({
        score: 0.8,
        verdict: "pass",
        reason: "ok",
      }),
    });

    const { reasoningQualityScorer } = await import(
      "@/evals/scorers/reasoningQuality"
    );

    const res = await reasoningQualityScorer.run({
      output: {
        toolCalls: [
          {
            name: "logAction",
            args: { reasoning: "Unique reasoning for dedupe test PR3." },
          },
        ],
      },
      groundTruth: {},
    } as never);

    // Mastra invokes both hooks; in-flight + exact cache must collapse to 1 generateText.
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(res.score).toBe(0.8);
    expect(res.reason).toBe("ok");
  });

  it("reuses exact judge cache on a second scorer run with same reasoning", async () => {
    generateText.mockResolvedValue({
      text: JSON.stringify({
        score: 0.7,
        verdict: "pass",
        reason: "cached",
      }),
    });

    const { reasoningQualityScorer } = await import(
      "@/evals/scorers/reasoningQuality"
    );
    const output = {
      toolCalls: [
        {
          name: "logAction",
          args: { reasoning: "Cache hit reasoning blob for PR3." },
        },
      ],
    };

    await reasoningQualityScorer.run({ output, groundTruth: {} } as never);
    await reasoningQualityScorer.run({ output, groundTruth: {} } as never);

    expect(generateText).toHaveBeenCalledTimes(1);
  });

  it("scores 0 when judge returns unknown / NEEDS_REVIEW", async () => {
    generateText.mockResolvedValue({
      text: JSON.stringify({
        score: 0.99,
        verdict: "NEEDS_REVIEW",
        reason: "urgency ambiguous",
      }),
    });

    const { reasoningQualityScorer } = await import(
      "@/evals/scorers/reasoningQuality"
    );

    const res = await reasoningQualityScorer.run({
      output: {
        toolCalls: [
          {
            name: "logAction",
            args: { reasoning: "Maybe remind the client somehow." },
          },
        ],
      },
      groundTruth: {},
    } as never);

    expect(res.score).toBe(0);
  });
});
