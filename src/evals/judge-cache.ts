import { createHash } from "node:crypto";
import { z } from "zod";
import { env, getEvalJudgeEscalateModelId, getModelId } from "@/lib/config";
import {
  judgeVerdictSchema,
  type JudgeVerdict,
} from "@/evals/scorers/judge-verdict";

/**
 * Rubric / soft-scorer prompt version for exact judge-cache keys.
 * Bump when `buildJudgePrompt` or verdict schema semantics change.
 */
export const REASONING_QUALITY_RUBRIC_VERSION = "reasoning-quality-v1" as const;

const judgeCacheKeyPartsSchema = z.object({
  /** Prompt / system hash (or prompt version id). */
  promptVersion: z.string().min(1),
  /** Tool-schema hash; use "none" when tools are not part of the judge input. */
  toolsHash: z.string().min(1),
  scenarioId: z.string().min(1),
  /** Hash of the trajectory / reasoning transcript under judgment. */
  trajectoryHash: z.string().min(1),
  evalJudgeModelId: z.string().min(1),
  rubricVersion: z.string().min(1),
});

export type JudgeCacheKeyParts = z.infer<typeof judgeCacheKeyPartsSchema>;

const cachedVerdictSchema = z.object({
  verdict: judgeVerdictSchema,
  cachedAt: z.string().datetime(),
  key: z.string().min(1),
});

export type CachedJudgeVerdict = z.infer<typeof cachedVerdictSchema>;

export type JudgeCacheStats = {
  hits: number;
  misses: number;
  writes: number;
};

const store = new Map<string, CachedJudgeVerdict>();
const stats: JudgeCacheStats = { hits: 0, misses: 0, writes: 0 };

/**
 * Canonical sha256 fingerprint for an exact judge-result cache key.
 * Semantic / fuzzy matching is intentionally unsupported (compliance risk).
 */
export function buildJudgeCacheKey(parts: JudgeCacheKeyParts): string {
  const parsed = judgeCacheKeyPartsSchema.parse(parts);
  const canonical = JSON.stringify({
    promptVersion: parsed.promptVersion,
    toolsHash: parsed.toolsHash,
    scenarioId: parsed.scenarioId,
    trajectoryHash: parsed.trajectoryHash,
    evalJudgeModelId: parsed.evalJudgeModelId,
    rubricVersion: parsed.rubricVersion,
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/**
 * Stable hash of a reasoning / trajectory blob for cache keys.
 */
export function hashJudgeTrajectory(trajectory: string): string {
  return createHash("sha256").update(trajectory, "utf8").digest("hex");
}

/**
 * Builds default key parts for the reasoning-quality soft judge.
 * Includes escalate model id when cascade Pilot is configured so policy bumps invalidate.
 */
export function reasoningQualityCacheKeyParts(input: {
  reasoning: string;
  scenarioId?: string;
  toolsHash?: string;
  promptVersion?: string;
}): JudgeCacheKeyParts {
  const escalateId = getEvalJudgeEscalateModelId() ?? "none";
  return {
    promptVersion: input.promptVersion ?? REASONING_QUALITY_RUBRIC_VERSION,
    toolsHash: input.toolsHash ?? "none",
    scenarioId: input.scenarioId ?? "anonymous",
    trajectoryHash: hashJudgeTrajectory(input.reasoning),
    // Fold escalate pin into model id slot so cascade config changes miss the cache.
    evalJudgeModelId: `${getModelId("evalJudge")}|escalate:${escalateId}`,
    rubricVersion: REASONING_QUALITY_RUBRIC_VERSION,
  };
}

/**
 * Looks up an exact cached judge verdict. Never semantic-matches.
 */
export function getCachedJudgeVerdict(
  key: string
): CachedJudgeVerdict | undefined {
  if (!env.EVAL_JUDGE_CACHE) return undefined;
  const hit = store.get(key);
  if (hit) {
    stats.hits += 1;
    return hit;
  }
  stats.misses += 1;
  return undefined;
}

/**
 * Write-through exact judge verdict. No-ops when cache is disabled.
 */
export function setCachedJudgeVerdict(
  key: string,
  verdict: JudgeVerdict
): CachedJudgeVerdict | null {
  if (!env.EVAL_JUDGE_CACHE) return null;
  const entry = cachedVerdictSchema.parse({
    verdict,
    // REGULATORY/demo clock — never wall-clock in Cerebro date paths.
    cachedAt: env.DEMO_DATE,
    key,
  });
  store.set(key, entry);
  stats.writes += 1;
  return entry;
}

/**
 * Returns a snapshot of in-process judge-cache counters.
 */
export function getJudgeCacheStats(): JudgeCacheStats {
  return { ...stats };
}

/**
 * Clears the in-process judge cache (tests / prompt-version bump).
 */
export function clearJudgeCache(): void {
  store.clear();
  stats.hits = 0;
  stats.misses = 0;
  stats.writes = 0;
}
