import type { TrajectoryGolden } from "../trajectory-golden";
import { trajectoryGoldenSchema } from "../trajectory-golden";

export type TrajectoryScoreResult = {
  score: number;
  reason: string;
};

function isSubsequence(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0) return true;
  let i = 0;
  for (const item of haystack) {
    if (item === needle[i]) {
      i += 1;
      if (i === needle.length) return true;
    }
  }
  return false;
}

/**
 * Deterministic trajectory grader: expected tools, ordered sequence, forbidden tools, step budget.
 * Returns 1.0 when all defined constraints pass; 0.0 otherwise.
 */
export function scoreTrajectory(
  toolNames: string[],
  golden: TrajectoryGolden | undefined | null
): TrajectoryScoreResult {
  if (!golden) {
    return { score: 1.0, reason: "N/A - no trajectory golden for scenario" };
  }

  const parsed = trajectoryGoldenSchema.safeParse(golden);
  if (!parsed.success) {
    return {
      score: 0.0,
      reason: `Invalid trajectory golden: ${parsed.error.message}`,
    };
  }
  const g = parsed.data;

  if (g.maxSteps !== undefined && toolNames.length > g.maxSteps) {
    return {
      score: 0.0,
      reason: `Step budget exceeded: ${toolNames.length} > maxSteps ${g.maxSteps}`,
    };
  }

  if (g.forbiddenTools && g.forbiddenTools.length > 0) {
    const hit = g.forbiddenTools.filter((t) => toolNames.includes(t));
    if (hit.length > 0) {
      return {
        score: 0.0,
        reason: `Forbidden tool(s) used: ${hit.join(", ")} (trajectory fail even if end-state looks correct)`,
      };
    }
  }

  if (g.expectedTools && g.expectedTools.length > 0) {
    const missing = g.expectedTools.filter((t) => !toolNames.includes(t));
    if (missing.length > 0) {
      return {
        score: 0.0,
        reason: `Missing expected tool(s): ${missing.join(", ")}`,
      };
    }
  }

  if (g.expectedToolSequence && g.expectedToolSequence.length > 0) {
    if (!isSubsequence(toolNames, g.expectedToolSequence)) {
      return {
        score: 0.0,
        reason: `Expected tool sequence not found: [${g.expectedToolSequence.join(" → ")}]`,
      };
    }
  }

  return {
    score: 1.0,
    reason: `Trajectory OK (${toolNames.length} step(s)): ${toolNames.join(" → ") || "(none)"}`,
  };
}
