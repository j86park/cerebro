import { Worker, type Job } from "bullmq";
import {
  analyzeEvalRun,
  buildTaxonomy,
  mutatePrompt,
} from "@/workflows/meta-agent.workflow";
import { connection } from "@/lib/queue/client";
import { mutationAnalysisJobSchema, shadowRunQueue, type MutationAnalysisJobPayload } from "./queues";

const isVitest = process.env.VITEST === "true";

async function processMutationAnalysis(job: Job<MutationAnalysisJobPayload>): Promise<void> {
  const { evalRunId } = mutationAnalysisJobSchema.parse(job.data);

  const { evalRun, recentRuns } = await analyzeEvalRun(evalRunId);
  const taxonomy = await buildTaxonomy(evalRun, recentRuns);

  if (taxonomy.findings.length === 0) {
    console.warn(
      `[mutation-analysis] No taxonomy findings for eval ${evalRunId}; skipping mutation pipeline.`
    );
    return;
  }

  const { candidateVersionIds, mutationJobId, taxonomy: tax } =
    await mutatePrompt(taxonomy);

  for (const candidateVersionId of candidateVersionIds) {
    await shadowRunQueue.add(
      "shadow",
      {
        mutationJobId,
        candidateVersionId,
        agentId: tax.agentId === "onboarding" ? "onboarding" : "compliance",
      },
      { jobId: `${mutationJobId}-${candidateVersionId}` }
    );
  }
}

if (!isVitest) {
  const mutationWorker = new Worker<MutationAnalysisJobPayload>(
    "mutation-analysis",
    async (job) => {
      try {
        await processMutationAnalysis(job);
      } catch (err) {
        console.error("[mutation-analysis] job failed:", err);
        throw err;
      }
    },
    {
      connection: connection as never,
      concurrency: 1,
    }
  );
  mutationWorker.on("ready", () =>
    console.log("[Worker] mutation-analysis queue ready (concurrency: 1)")
  );
}
