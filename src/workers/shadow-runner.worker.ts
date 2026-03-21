import { Worker, type Job } from "bullmq";
import { prisma } from "@/lib/db/client";
import { runAllEvals, type ScenarioEvalRow } from "@/evals/run";
import {
  fullyPassingRate,
  getCanaryClientIds,
  isFullyPassingScores,
} from "@/lib/eval-scenario-utils";
import { invalidateAgent } from "@/lib/prompt-loader";
import { connection } from "@/lib/queue/client";
import { evaluateGate } from "./regression-gate";
import { shadowRunJobSchema, type ShadowRunJobPayload } from "./queues";

const isVitest = process.env.VITEST === "true";

async function swapActiveVersion(agentId: string, versionId: string): Promise<void> {
  await prisma.$transaction([
    prisma.promptVersion.updateMany({
      where: { agentId, isActive: true },
      data: { isActive: false },
    }),
    prisma.promptVersion.update({
      where: { id: versionId },
      data: { isActive: true },
    }),
  ]);
  invalidateAgent(agentId);
}

async function processShadowRun(job: Job<ShadowRunJobPayload>): Promise<void> {
  const data = shadowRunJobSchema.parse(job.data);
  const { mutationJobId, candidateVersionId, agentId } = data;

  const previousActive = await prisma.promptVersion.findFirst({
    where: { agentId, isActive: true },
  });
  if (!previousActive) {
    throw new Error(`shadow-run: no active PromptVersion for ${agentId}`);
  }

  await swapActiveVersion(agentId, candidateVersionId);

  try {
    const result = await runAllEvals(3, { skipPersist: true });

    const baseline = await prisma.evalRun.findFirst({
      orderBy: { runAt: "desc" },
    });
    if (!baseline) {
      throw new Error("shadow-run: no persisted EvalRun for baseline");
    }

    const baseResults = baseline.scenarioResults as Record<string, ScenarioEvalRow>;
    const candResults = result.scenarioResults;

    const allIds = [
      ...new Set([...Object.keys(baseResults), ...Object.keys(candResults)]),
    ];

    const targetIds = allIds.filter(
      (id) =>
        baseResults[id]?.scores &&
        !isFullyPassingScores(baseResults[id]!.scores)
    );
    const corpusIds = allIds.filter(
      (id) =>
        baseResults[id]?.scores &&
        isFullyPassingScores(baseResults[id]!.scores)
    );
    const canarySet = new Set(getCanaryClientIds());
    const canaryIds = allIds.filter((id) => canarySet.has(id));

    const targetDelta =
      fullyPassingRate(targetIds, candResults) -
      fullyPassingRate(targetIds, baseResults);
    const corpusDelta =
      fullyPassingRate(corpusIds, candResults) -
      fullyPassingRate(corpusIds, baseResults);
    const canaryDelta =
      fullyPassingRate(canaryIds, candResults) -
      fullyPassingRate(canaryIds, baseResults);
    const overallDelta = result.overallScore - baseline.overallScore;

    await prisma.shadowRunResult.create({
      data: {
        mutationJobId,
        candidateVersionId,
        targetDelta,
        corpusDelta,
        canaryDelta,
        overallDelta,
        gateDecision: "pending",
        scoreBreakdown: {
          baselineOverall: baseline.overallScore,
          candidateOverall: result.overallScore,
          targetIds,
          corpusIds,
          canaryIds,
        },
      },
    });
  } finally {
    await swapActiveVersion(agentId, previousActive.id);
  }

  // Gate runs after restore so `evaluateGate` promotion activates the winner explicitly (not the shadow candidate still swapped in).
  await evaluateGate(mutationJobId);
}

if (!isVitest) {
  const shadowWorker = new Worker<ShadowRunJobPayload>(
    "shadow-run",
    async (job) => {
      await processShadowRun(job);
    },
    {
      connection: connection as never,
      concurrency: 1,
    }
  );
  shadowWorker.on("ready", () =>
    console.log("[Worker] shadow-run queue ready (concurrency: 1)")
  );
}
