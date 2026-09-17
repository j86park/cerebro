import { Worker } from "bullmq";
import { env } from "@/lib/config";
import { VaultService } from "@/lib/db/vault-service";
import {
  onlineJudgeJobSchema,
  type OnlineJudgeJobPayload,
} from "@/lib/evals/online-judge-sample";
import { connection } from "@/lib/queue/client";
import { judgeReasoningQuality } from "@/evals/scorers/reasoningQuality";
import { stagePromoteCandidateFromOnlineSample } from "@/evals/golden/promote-queue";

/**
 * Builds a short reasoning blob for the online judge from agent text + tools.
 */
export function buildOnlineJudgeReasoning(input: {
  reasoningText: string;
  toolNames: string[];
}): string {
  const tools =
    input.toolNames.length > 0
      ? `Tools: ${input.toolNames.join(", ")}`
      : "Tools: (none)";
  const text = input.reasoningText.trim() || "(no agent text)";
  return `${tools}\n\nAgent output:\n${text}`.slice(0, 4000);
}

/**
 * Processes one online judge sample job.
 * DRY_RUN: persist DecisionRecord intent without calling OpenRouter; may still
 * stage a pending promote-queue candidate for failure-weighted samples.
 * Live: call getModel("evalJudge") via judgeReasoningQuality and log verdict.
 * Never auto-promotes into the ship gate — human approve only.
 */
export async function processOnlineJudgeJob(
  data: OnlineJudgeJobPayload,
): Promise<{
  outcome: string;
  skippedLlm: boolean;
  promoteQueued: boolean;
  candidateId?: string;
}> {
  const parsed = onlineJudgeJobSchema.parse(data);
  const vault = new VaultService({ clientId: parsed.clientId });
  const judgeJobId = `oj-${parsed.sourceJobId}`;
  const reasoning = buildOnlineJudgeReasoning({
    reasoningText: parsed.reasoningText,
    toolNames: parsed.toolNames,
  });

  if (env.DRY_RUN) {
    await vault.logDecision({
      jobId: judgeJobId,
      agentName: parsed.agentName,
      stage: parsed.stage,
      traceId: parsed.traceId,
      outcome: "DRY_RUN",
      reason:
        "Online judge sample enqueued but LLM call skipped under DRY_RUN",
      contentCaptured: false,
      metadata: {
        kind: "online_judge_sample",
        sourceJobId: parsed.sourceJobId,
        agentType: parsed.agentType,
        sampleRate: env.ONLINE_JUDGE_SAMPLE_RATE,
        failureSampleRate: env.ONLINE_JUDGE_FAILURE_SAMPLE_RATE,
        stream: parsed.stream,
        isFailureSignal: parsed.isFailureSignal,
        reasoningPreview: reasoning.slice(0, 240),
      },
    });

    const staged = await stagePromoteCandidateFromOnlineSample({
      clientId: parsed.clientId,
      agentType: parsed.agentType,
      sourceJobId: parsed.sourceJobId,
      toolNames: parsed.toolNames,
      stream: parsed.stream,
      isFailureSignal: parsed.isFailureSignal,
      reasoningPreview: reasoning.slice(0, 240),
      verdict: null,
    });

    return {
      outcome: "DRY_RUN",
      skippedLlm: true,
      promoteQueued: staged.staged,
      candidateId: staged.staged ? staged.candidateId : undefined,
    };
  }

  const verdict = await judgeReasoningQuality(reasoning);
  await vault.logDecision({
    jobId: judgeJobId,
    agentName: parsed.agentName,
    stage: parsed.stage,
    traceId: parsed.traceId,
    outcome: "ONLINE_JUDGED",
    reason: verdict
      ? `Online judge verdict=${verdict.verdict} score=${verdict.score}`
      : "Online judge returned unparseable verdict",
    contentCaptured: false,
    metadata: {
      kind: "online_judge_sample",
      sourceJobId: parsed.sourceJobId,
      agentType: parsed.agentType,
      sampleRate: env.ONLINE_JUDGE_SAMPLE_RATE,
      failureSampleRate: env.ONLINE_JUDGE_FAILURE_SAMPLE_RATE,
      stream: parsed.stream,
      isFailureSignal: parsed.isFailureSignal,
      verdict: verdict ?? null,
    },
  });

  const staged = await stagePromoteCandidateFromOnlineSample({
    clientId: parsed.clientId,
    agentType: parsed.agentType,
    sourceJobId: parsed.sourceJobId,
    toolNames: parsed.toolNames,
    stream: parsed.stream,
    isFailureSignal: parsed.isFailureSignal,
    reasoningPreview: reasoning.slice(0, 240),
    verdict,
  });

  return {
    outcome: "ONLINE_JUDGED",
    skippedLlm: false,
    promoteQueued: staged.staged,
    candidateId: staged.staged ? staged.candidateId : undefined,
  };
}

const isVitest = process.env.VITEST === "true";

if (!isVitest) {
  const worker = new Worker<OnlineJudgeJobPayload>(
    "online-judge",
    async (job) => {
      const payload = onlineJudgeJobSchema.parse(job.data);
      console.log(
        `[OnlineJudge] Sampling sourceJob=${payload.sourceJobId} client=${payload.clientId} stream=${payload.stream}`,
      );
      return processOnlineJudgeJob(payload);
    },
    {
      connection: connection as never,
      concurrency: 2,
    },
  );

  worker.on("completed", (job) => {
    console.log(`[OnlineJudge] Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[OnlineJudge] Job ${job?.id} failed:`, err);
  });
}
