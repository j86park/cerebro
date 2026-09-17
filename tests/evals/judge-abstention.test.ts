import { describe, expect, it } from "vitest";
import {
  isAbstentionVerdict,
  softJudgeAllowsPromote,
  scoreFromJudgeVerdict,
  type JudgeVerdict,
} from "@/evals/scorers/judge-verdict";

describe("soft judge abstention = non-promote", () => {
  const pass: JudgeVerdict = {
    score: 0.9,
    verdict: "pass",
    reason: "Specific and regulatory-aware",
  };
  const fail: JudgeVerdict = {
    score: 0.2,
    verdict: "fail",
    reason: "Generic boilerplate",
  };
  const unknown: JudgeVerdict = {
    score: 0.8,
    verdict: "unknown",
    reason: "Too thin to judge",
  };
  const needsReview: JudgeVerdict = {
    score: 0.85,
    verdict: "NEEDS_REVIEW",
    reason: "Ambiguous urgency",
  };

  it("treats unknown and NEEDS_REVIEW as abstention", () => {
    expect(isAbstentionVerdict(unknown)).toBe(true);
    expect(isAbstentionVerdict(needsReview)).toBe(true);
    expect(isAbstentionVerdict(pass)).toBe(false);
    expect(isAbstentionVerdict(fail)).toBe(false);
  });

  it("maps abstention to score 0 even if the model emitted a high numeric score", () => {
    expect(scoreFromJudgeVerdict(unknown)).toBe(0);
    expect(scoreFromJudgeVerdict(needsReview)).toBe(0);
    expect(scoreFromJudgeVerdict(pass)).toBe(0.9);
  });

  it("never allows promote on abstention, null, or fail", () => {
    expect(softJudgeAllowsPromote(null)).toBe(false);
    expect(softJudgeAllowsPromote(unknown)).toBe(false);
    expect(softJudgeAllowsPromote(needsReview)).toBe(false);
    expect(softJudgeAllowsPromote(fail)).toBe(false);
    expect(softJudgeAllowsPromote(pass)).toBe(true);
  });
});
