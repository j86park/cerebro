import { env } from "@/lib/config";
import {
  buildOnlineJudgeJobId,
  onlineJudgeJobSchema,
  shouldSampleOnlineJudge,
  type OnlineJudgeJobPayload,
} from "@/lib/evals/online-judge-sample";
import { isDuplicateJobIdError } from "@/lib/queue/jobs";
import { onlineJudgeQueue } from "@/workers/queues";

export type MaybeEnqueueOnlineJudgeResult =
  | { enqueued: false; reason: "rate_miss" | "empty_reasoning" | "error"; error?: string }
  | { enqueued: true; jobId: string; deduplicated: boolean };

/**
 * Fire-and-forget enqueue of an async online judge sample after an agent job succeeds.
 * Never throws to the caller — sampling must not break the agent worker.
 */
export async function maybeEnqueueOnlineJudgeSample(
  input: OnlineJudgeJobPayload,
): Promise<MaybeEnqueueOnlineJudgeResult> {
  try {
    const parsed = onlineJudgeJobSchema.parse(input);
    if (!shouldSampleOnlineJudge()) {
      return { enqueued: false, reason: "rate_miss" };
    }
    if (!parsed.reasoningText.trim() && parsed.toolNames.length === 0) {
      return { enqueued: false, reason: "empty_reasoning" };
    }

    const jobId = buildOnlineJudgeJobId(parsed.sourceJobId);
    try {
      await onlineJudgeQueue.add("online-judge-sample", parsed, {
        jobId,
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 100 },
      });
      return { enqueued: true, jobId, deduplicated: false };
    } catch (err) {
      if (isDuplicateJobIdError(err)) {
        return { enqueued: true, jobId, deduplicated: true };
      }
      throw err;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[OnlineJudge] Failed to enqueue sample (DRY_RUN=${env.DRY_RUN}):`,
      message,
    );
    return { enqueued: false, reason: "error", error: message };
  }
}
