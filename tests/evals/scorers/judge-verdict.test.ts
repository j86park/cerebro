import { describe, expect, it } from "vitest";
import {
  judgeVerdictSchema,
  parseJudgeVerdict,
  scoreFromJudgeVerdict,
} from "@/evals/scorers/judge-verdict";

describe("judgeVerdictSchema", () => {
  it("accepts pass / fail / unknown / NEEDS_REVIEW", () => {
    for (const verdict of ["pass", "fail", "unknown", "NEEDS_REVIEW"] as const) {
      const parsed = judgeVerdictSchema.parse({
        score: verdict === "pass" ? 0.9 : 0.2,
        verdict,
        reason: "test",
      });
      expect(parsed.verdict).toBe(verdict);
    }
  });

  it("rejects invalid verdict labels", () => {
    expect(() =>
      judgeVerdictSchema.parse({
        score: 1,
        verdict: "maybe",
        reason: "nope",
      })
    ).toThrow();
  });
});

describe("parseJudgeVerdict", () => {
  it("parses plain JSON", () => {
    const v = parseJudgeVerdict(
      JSON.stringify({ score: 0.8, verdict: "pass", reason: "specific and regulatory" })
    );
    expect(v).toEqual({
      score: 0.8,
      verdict: "pass",
      reason: "specific and regulatory",
    });
  });

  it("parses fenced JSON", () => {
    const v = parseJudgeVerdict(
      '```json\n{"score":0.1,"verdict":"unknown","reason":"thin evidence"}\n```'
    );
    expect(v?.verdict).toBe("unknown");
  });

  it("returns null on unparseable text", () => {
    expect(parseJudgeVerdict("not json at all")).toBeNull();
  });
});

describe("scoreFromJudgeVerdict", () => {
  it("forces 0 for unknown so thin evidence does not silently pass", () => {
    expect(
      scoreFromJudgeVerdict({
        score: 0.95,
        verdict: "unknown",
        reason: "not enough to judge",
      })
    ).toBe(0);
  });

  it("forces 0 for NEEDS_REVIEW", () => {
    expect(
      scoreFromJudgeVerdict({
        score: 1,
        verdict: "NEEDS_REVIEW",
        reason: "ambiguous urgency",
      })
    ).toBe(0);
  });

  it("keeps numeric score for pass and fail", () => {
    expect(
      scoreFromJudgeVerdict({ score: 0.85, verdict: "pass", reason: "ok" })
    ).toBe(0.85);
    expect(
      scoreFromJudgeVerdict({ score: 0.2, verdict: "fail", reason: "generic" })
    ).toBe(0.2);
  });
});
