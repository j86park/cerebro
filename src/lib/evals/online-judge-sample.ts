import { z } from "zod";
import { env } from "@/lib/config";

export const onlineJudgeSampleRateSchema = z.number().min(0).max(0.05);

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
});

export type OnlineJudgeJobPayload = z.infer<typeof onlineJudgeJobSchema>;

/**
 * Deterministic BullMQ jobId for an online judge sample (3-segment safe).
 */
export function buildOnlineJudgeJobId(sourceJobId: string): string {
  const safe = sourceJobId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
  return `oj:${safe}:sample`;
}

/**
 * Whether this completed agent job should be sampled for online judge.
 * Rate is clamped to [0, 0.05]; 0 disables sampling.
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
