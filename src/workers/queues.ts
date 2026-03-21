import { Queue } from "bullmq";
import { z } from "zod";
import { connection } from "@/lib/queue/client";

export const mutationAnalysisJobSchema = z.object({
  evalRunId: z.string().min(1),
});

export type MutationAnalysisJobPayload = z.infer<typeof mutationAnalysisJobSchema>;

export const shadowRunJobSchema = z.object({
  mutationJobId: z.string().min(1),
  candidateVersionId: z.string().min(1),
  agentId: z.enum(["compliance", "onboarding"]),
});

export type ShadowRunJobPayload = z.infer<typeof shadowRunJobSchema>;

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 2000 },
  removeOnComplete: { count: 500 },
  removeOnFail: { count: 200 },
};

export const mutationAnalysisQueue = new Queue<MutationAnalysisJobPayload>(
  "mutation-analysis",
  {
    connection: connection as never,
    defaultJobOptions,
  }
);

export const shadowRunQueue = new Queue<ShadowRunJobPayload>("shadow-run", {
  connection: connection as never,
  defaultJobOptions,
});
