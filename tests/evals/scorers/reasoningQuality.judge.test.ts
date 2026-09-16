import { beforeEach, describe, expect, it, vi } from "vitest";

const generateText = vi.fn();
const getModel = vi.fn((_tier?: string) => "mock-eval-judge-model");

vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => generateText(...args),
}));

vi.mock("@/lib/config", () => ({
  getModel: (tier: string) => getModel(tier),
}));

describe("reasoningQualityScorer evalJudge pin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getModel.mockReturnValue("mock-eval-judge-model");
  });

  it('calls getModel("evalJudge") exclusively — never a hardcoded model string', async () => {
    generateText.mockResolvedValue({
      text: JSON.stringify({
        score: 0.9,
        verdict: "pass",
        reason: "specific and regulatory-aware",
      }),
    });

    const { reasoningQualityScorer } = await import("@/evals/scorers/reasoningQuality");

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

  it("scores 0 when judge returns unknown / NEEDS_REVIEW", async () => {
    generateText.mockResolvedValue({
      text: JSON.stringify({
        score: 0.99,
        verdict: "NEEDS_REVIEW",
        reason: "urgency ambiguous",
      }),
    });

    const { reasoningQualityScorer } = await import("@/evals/scorers/reasoningQuality");

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
