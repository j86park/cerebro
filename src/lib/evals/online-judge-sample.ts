import { z } from "zod";
import { env } from "@/lib/config";

export const onlineJudgeSampleRateSchema = z.number().min(0).max(0.05);

export const onlineJudgeFailureSampleRateSchema = z.number().min(0).max(1);

/** Dual-stream online sample labels (cheap-eval PR5). */
export const onlineSampleStreamSchema = z.enum([
  "uniform",
  "failure_weighted",
]);

export type OnlineSampleStream = z.infer<typeof onlineSampleStreamSchema>;

export const onlineJudgeJobSchema = z.object({
  clientId: z.string().min(1),
  agentType: z.enum(["COMPLIANCE", "ONBOARDING"]),
  sourceJobId: z.string().min(1),
  traceId: z
    .string()
    .regex(/^[0-9a-f]{1,32}$/i, "traceId must be 1–32 hexadecimal characters"),
  agentName: z.string().min(1),
  stage: z.number().int().optional(),
  /** Agent text / reasoning excerpt for the judge (may be empty). */
  reasoningText: z.string(),
  toolNames: z.array(z.string()).default([]),
  /** Which dual-stream lane selected this sample. */
  stream: onlineSampleStreamSchema.default("uniform"),
  /**
   * True when the source job failed or carried a high-risk / hard-fail signal.
   * Used for failure-weighted oversample into the promote queue.
   */
  isFailureSignal: z.boolean().default(false),
});

export type OnlineJudgeJobPayload = z.infer<typeof onlineJudgeJobSchema>;

export type OnlineSampleDecision =
  | { sample: false }
  | { sample: true; stream: OnlineSampleStream };

/**
 * Deterministic BullMQ jobId for an online judge sample (3-segment safe).
 */
export function buildOnlineJudgeJobId(sourceJobId: string): string {
  const safe = sourceJobId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
  return `oj:${safe}:sample`;
}

/**
 * Dual-stream online sample decision (cheap-eval PR5).
 *
 * 1. Failure-weighted: when `isFailureSignal`, roll against failure rate (default 25%).
 * 2. Uniform: otherwise (or on failure miss) roll against uniform rate (≤5%).
 *
 * Online sampling is async promote-queue fuel — never the primary ship gate.
 */
export function selectOnlineJudgeSample(options?: {
  isFailureSignal?: boolean;
  uniformRate?: number;
  failureRate?: number;
  random?: () => number;
}): OnlineSampleDecision {
  const uniformRate = onlineJudgeSampleRateSchema.parse(
    options?.uniformRate ?? env.ONLINE_JUDGE_SAMPLE_RATE,
  );
  const failureRate = onlineJudgeFailureSampleRateSchema.parse(
    options?.failureRate ?? env.ONLINE_JUDGE_FAILURE_SAMPLE_RATE,
  );
  const roll = options?.random?.() ?? Math.random();
  const isFailure = options?.isFailureSignal === true;

  if (isFailure && failureRate > 0 && roll < failureRate) {
    return { sample: true, stream: "failure_weighted" };
  }

  // Second independent roll for uniform so failure misses can still drift-sample.
  const uniformRoll = options?.random?.() ?? Math.random();
  if (uniformRate > 0 && uniformRoll < uniformRate) {
    return { sample: true, stream: "uniform" };
  }

  return { sample: false };
}

/**
 * Whether this completed agent job should be sampled for online judge.
 * Rate is clamped to [0, 0.05]; 0 disables sampling.
 * Prefer `selectOnlineJudgeSample` for dual-stream labeling.
 */
export function shouldSampleOnlineJudge(options?: {
  rate?: number;
  random?: () => number;
}): boolean {
  const rate = onlineJudgeSampleRateSchema.parse(
    options?.rate ?? env.ONLINE_JUDGE_SAMPLE_RATE,
  );
  if (rate <= 0) return false;
  const roll = options?.random?.() ?? Math.random();
  return roll < rate;
}
