import { describe, expect, it } from "vitest";
import {
  assertEvalOverallScore,
  EvalThresholdError,
  EVAL_OVERALL_THRESHOLD,
} from "@/evals/threshold";

describe("eval overall threshold", () => {
  it("throws EvalThresholdError when score is below threshold", () => {
    expect(() => assertEvalOverallScore(EVAL_OVERALL_THRESHOLD - 0.01)).toThrow(
      EvalThresholdError
    );
  });

  it("does not throw at exactly the threshold", () => {
    expect(() => assertEvalOverallScore(EVAL_OVERALL_THRESHOLD)).not.toThrow();
  });

  it("does not throw above threshold", () => {
    expect(() => assertEvalOverallScore(0.99)).not.toThrow();
  });
});
