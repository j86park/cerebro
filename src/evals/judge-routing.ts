import { z } from "zod";
import {
  assertEvalBudget,
  buildLiveEvalSessionId,
  env,
  getEvalJudgeEscalateModelId,
  getModelId,
  isEvalJudgeCascadeEnabled,
} from "@/lib/config";
import {
  getJudgeCacheStats,
  REASONING_QUALITY_RUBRIC_VERSION,
} from "@/evals/judge-cache";
import { isAbstentionVerdict, type JudgeVerdict } from "@/evals/scorers/judge-verdict";
import type { EvalRunMode } from "@/evals/scorer-selection";
import type { SuiteSelection } from "@/evals/suite-modes";

/**
 * Soft judge under `pass^k`: hard scorers every trial; soft judge once per scenario
 * (trial 0 only) unless measuring judge variance. Canary-ci already omits soft entirely.
 */
export function shouldRunSoftJudgeForPassKTrial(
  trialIndex: number,
  mode: EvalRunMode
): boolean {
  if (mode === "canary-ci") return false;
  return trialIndex === 0;
}

/**
 * Cascade escalate trigger: abstention / thin evidence only (Pilot).
 * Clear soft `fail` from the primary judge does not escalate (saves $).
 */
export function shouldEscalateJudgeVerdict(
  verdict: JudgeVerdict | null
): boolean {
  if (!isEvalJudgeCascadeEnabled()) return false;
  if (!verdict) return true; // parse failure → escalate once when Pilot on
  return isAbstentionVerdict(verdict);
}

export const evalRunModelStampSchema = z.object({
  autTier: z.literal("dev"),
  autModelId: z.string().min(1),
  judgeTier: z.literal("evalJudge"),
  judgeModelId: z.string().min(1),
  judgeEscalateModelId: z.string().nullable(),
  rubricVersion: z.string().min(1),
  cascadeEnabled: z.boolean(),
  judgeCacheEnabled: z.boolean(),
  liveSessionId: z.string().nullable(),
});

export type EvalRunModelStamp = z.infer<typeof evalRunModelStampSchema>;

export const evalRunCostStampSchema = z.object({
  /** Recorded OpenRouter USD for this wave (agent + judge). Default 0 in fixture CI. */
  spendUsd: z.number().min(0),
  agentTokens: z.number().int().min(0).optional(),
  judgeTokens: z.number().int().min(0).optional(),
  cachedTokens: z.number().int().min(0).optional(),
  cacheDiscount: z.number().optional(),
  judgeCacheHits: z.number().int().min(0),
  judgeCacheMisses: z.number().int().min(0),
  cascadeEscalations: z.number().int().min(0),
});

export type EvalRunCostStamp = z.infer<typeof evalRunCostStampSchema>;

export const evalRunMetadataSchema = z.object({
  kind: z.literal("cheap_eval_pr3_stamps"),
  suiteMode: z.string().min(1),
  scorerMode: z.enum(["canary-ci", "full"]),
  isFinal: z.boolean(),
  models: evalRunModelStampSchema,
  cost: evalRunCostStampSchema,
});

export type EvalRunMetadata = z.infer<typeof evalRunMetadataSchema>;

export type CascadeCounters = {
  escalations: number;
};

const cascadeCounters: CascadeCounters = { escalations: 0 };

/**
 * Increments cascade escalate counter (for EvalRun cost stamps).
 */
export function recordCascadeEscalation(): void {
  cascadeCounters.escalations += 1;
}

/**
 * Returns and optionally resets cascade counters.
 */
export function getCascadeCounters(reset = false): CascadeCounters {
  const snap = { ...cascadeCounters };
  if (reset) cascadeCounters.escalations = 0;
  return snap;
}

/**
 * Builds EvalRun metadata stamps (AUT=`dev`, judge=`evalJudge` when used).
 */
export function buildEvalRunMetadata(input: {
  suite: SuiteSelection;
  mode: EvalRunMode;
  isFinal: boolean;
  liveSessionId?: string | null;
  spendUsd?: number;
  agentTokens?: number;
  judgeTokens?: number;
  cachedTokens?: number;
  cacheDiscount?: number;
}): EvalRunMetadata {
  const cacheStats = getJudgeCacheStats();
  const cascade = getCascadeCounters();
  const spendUsd = input.spendUsd ?? 0;
  assertEvalBudget(spendUsd);

  return evalRunMetadataSchema.parse({
    kind: "cheap_eval_pr3_stamps",
    suiteMode: input.suite.mode,
    scorerMode: input.mode,
    isFinal: input.isFinal,
    models: {
      autTier: "dev",
      autModelId: getModelId("dev"),
      judgeTier: "evalJudge",
      judgeModelId: getModelId("evalJudge"),
      judgeEscalateModelId: getEvalJudgeEscalateModelId(),
      rubricVersion: REASONING_QUALITY_RUBRIC_VERSION,
      cascadeEnabled: isEvalJudgeCascadeEnabled(),
      judgeCacheEnabled: env.EVAL_JUDGE_CACHE,
      liveSessionId: input.liveSessionId
        ? buildLiveEvalSessionId(input.liveSessionId)
        : null,
    },
    cost: {
      spendUsd,
      agentTokens: input.agentTokens,
      judgeTokens: input.judgeTokens,
      cachedTokens: input.cachedTokens,
      cacheDiscount: input.cacheDiscount,
      judgeCacheHits: cacheStats.hits,
      judgeCacheMisses: cacheStats.misses,
      cascadeEscalations: cascade.escalations,
    },
  });
}
