import { Worker, Job } from "bullmq";
import Redis from "ioredis";
import { env } from "../config";
import type {
  ComplianceJobPayload,
  OnboardingJobPayload,
  DefaultJobPayload,
} from "./jobs";

// BullMQ requires maxRetriesPerRequest to be null
const connection = new Redis(env.UPSTASH_REDIS_URL, {
  maxRetriesPerRequest: null,
});

async function processComplianceJob(job: Job<ComplianceJobPayload>) {
  console.log(`[Worker] Processing compliance job ${job.id} for client: ${job.data.clientId}`);
  // TODO: Instantiate VaultService for this client and run Compliance Agent
}

async function processOnboardingJob(job: Job<OnboardingJobPayload>) {
  console.log(`[Worker] Processing onboarding job ${job.id} for client: ${job.data.clientId}`);
  // TODO: Instantiate VaultService for this client and run Onboarding Agent
}

async function processDefaultJob(job: Job<DefaultJobPayload>) {
  console.log(`[Worker] Processing default job ${job.id}: ${job.data.action}`);
  // TODO: Run general tasks or scheduled scans
}

// Implement workers with specific concurrency limits (based on ARCHITECTURE.md rate limiting goals)
export const workers = {
  compliance: new Worker<ComplianceJobPayload>(
    "compliance-queue",
    processComplianceJob,
    {
      connection: connection as any,
      concurrency: 5,
    }
  ),
  onboarding: new Worker<OnboardingJobPayload>(
    "onboarding-queue",
    processOnboardingJob,
    {
      connection: connection as any,
      concurrency: 5,
    }
  ),
  default: new Worker<DefaultJobPayload>(
    "default-queue",
    processDefaultJob,
    {
      connection: connection as any,
      concurrency: 3,
    }
  ),
};

// Hook up generic error/completion logging
Object.values(workers).forEach((worker) => {
  worker.on("completed", (job) => {
    console.log(`[Worker - ${worker.name}] Job ${job.id} completed successfully`);
  });
  worker.on("failed", (job, err) => {
    console.error(`[Worker - ${worker.name}] Job ${job?.id} failed:`, err);
  });
});
