import { afterEach, describe, expect, it } from "vitest";
import { MockLanguageModelV3 } from "ai/test";
import { generateText } from "ai";
import {
  getModel,
  hasModelOverride,
  setModelOverride,
  type ModelInstance,
} from "@/lib/config";
import { extractToolNamesFromOutput } from "@/evals/scorers/extract-tool-names";
import { scoreTrajectory } from "@/evals/scorers/score-trajectory";
import { GROUND_TRUTH } from "@/evals/ground-truth";
import { installUnitLaneModelBlock } from "../../helpers/unit-lane-model";

/**
 * Builds a MockLanguageModelV3 that emits a final text turn (no OpenRouter).
 * Cast: AI SDK LanguageModelV3GenerateResult shape drifts; runtime generateText accepts this mock.
 */
function mockTextModel(text: string): ModelInstance {
  return new MockLanguageModelV3({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test double; avoid coupling to provider result shape churn
    doGenerate: (async () => ({
      content: [{ type: "text", text }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: {
        inputTokens: { total: 0, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 0 },
      },
      warnings: [],
    })) as any,
  }) as unknown as ModelInstance;
}

describe("cheap-eval PR0 getModel seam + mocked LLM ($0)", () => {
  afterEach(() => {
    // Restore fail-closed guard so later files in the worker stay at $0.
    installUnitLaneModelBlock();
  });

  it("unit lane allows getModel construction but blocks generate", async () => {
    expect(hasModelOverride()).toBe(true);
    const model = getModel("dev");
    expect(model).toBeDefined();

    await expect(
      generateText({ model, prompt: "must not hit OpenRouter" })
    ).rejects.toThrow(/blocked in unit\/fixture/i);
  });

  it("injects MockLanguageModelV3 via setModelOverride without OpenRouter", async () => {
    setModelOverride(() => mockTextModel("ESCALATE_MANAGEMENT — mocked"));

    const model = getModel("dev");
    const { text } = await generateText({
      model,
      prompt: "ignore — fixture mock",
    });

    expect(text).toContain("ESCALATE_MANAGEMENT");
  });

  it("scores a mocked generate trajectory against CLT-003 golden at $0", async () => {
    const toolCalls = [
      { name: "getDocumentComplianceStatus" },
      { name: "escalateToManagement" },
      { name: "logAction" },
    ];

    setModelOverride(() =>
      mockTextModel(
        JSON.stringify({
          action: "ESCALATE_MANAGEMENT",
          toolCalls,
        })
      )
    );

    const { text } = await generateText({
      model: getModel("dev"),
      prompt: "run compliance for CLT-003",
    });

    const parsed = JSON.parse(text) as {
      toolCalls: Array<{ name: string }>;
    };
    const toolNames = extractToolNamesFromOutput({
      toolCalls: parsed.toolCalls,
    });

    const clt003 = GROUND_TRUTH.find((g) => g.clientId === "CLT-003");
    expect(clt003?.expected.trajectory).toBeDefined();

    const scored = scoreTrajectory(toolNames, clt003!.expected.trajectory);
    expect(scored.score).toBe(1);
  });

  it("mocked forbidden-tool trajectory still hard-fails CLT-003", async () => {
    const toolCalls = [
      { name: "getDocumentComplianceStatus" },
      { name: "completeOnboarding" },
      { name: "escalateToManagement" },
    ];

    setModelOverride(() =>
      mockTextModel(JSON.stringify({ toolCalls }))
    );

    const { text } = await generateText({
      model: getModel("dev"),
      prompt: "bad path",
    });
    const parsed = JSON.parse(text) as {
      toolCalls: Array<{ name: string }>;
    };
    const toolNames = extractToolNamesFromOutput({
      toolCalls: parsed.toolCalls,
    });

    const clt003 = GROUND_TRUTH.find((g) => g.clientId === "CLT-003");
    const scored = scoreTrajectory(toolNames, clt003!.expected.trajectory);
    expect(scored.score).toBe(0);
    expect(scored.reason).toMatch(/Forbidden/i);
  });
});
