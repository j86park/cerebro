import { env } from "@/lib/config";
import {
  buildOnlineJudgeJobId,
  onlineJudgeJobSchema,
  selectOnlineJudgeSample,
  type OnlineJudgeJobPayload,
} from "@/lib/evals/online-judge-sample";
import { isDuplicateJobIdError } from "@/lib/queue/jobs";
import { onlineJudgeQueue } from "@/workers/queues";

export type MaybeEnqueueOnlineJudgeResult =
  | {
      enqueued: false;
      reason: "rate_miss" | "empty_reasoning" | "error";
      error?: string;
    }
  | {
      enqueued: true;
      jobId: string;
      deduplicated: boolean;
      stream: "uniform" | "failure_weighted";
    };

/**
 * Fire-and-forget enqueue of an async online judge sample after an agent job.
 * Dual-stream (cheap-eval PR5): uniform ≤5% + failure-weighted oversample.
 * Never throws to the caller — sampling must not break the agent worker.
 */
export async function maybeEnqueueOnlineJudgeSample(
  input: Omit<OnlineJudgeJobPayload, "stream"> & {
    stream?: OnlineJudgeJobPayload["stream"];
    isFailureSignal?: boolean;
  },
): Promise<MaybeEnqueueOnlineJudgeResult> {
  try {
    const decision = selectOnlineJudgeSample({
      isFailureSignal: input.isFailureSignal === true,
    });
    if (!decision.sample) {
      return { enqueued: false, reason: "rate_miss" };
    }

    const parsed = onlineJudgeJobSchema.parse({
      ...input,
      stream: decision.stream,
      isFailureSignal: input.isFailureSignal === true,
    });

    if (!parsed.reasoningText.trim() && parsed.toolNames.length === 0) {
      // Failure-weighted may still stage with empty text via synthetic tools later;
      // require at least one signal for uniform drift samples.
      if (parsed.stream === "uniform") {
        return { enqueued: false, reason: "empty_reasoning" };
      }
    }

    const jobId = buildOnlineJudgeJobId(parsed.sourceJobId);
    try {
      await onlineJudgeQueue.add("online-judge-sample", parsed, {
        jobId,
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 100 },
      });
      return {
        enqueued: true,
        jobId,
        deduplicated: false,
        stream: parsed.stream,
      };
    } catch (err) {
      if (isDuplicateJobIdError(err)) {
        return {
          enqueued: true,
          jobId,
          deduplicated: true,
          stream: parsed.stream,
        };
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
