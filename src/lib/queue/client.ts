import { Queue } from "bullmq";
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

const queueOptions = {
  connection: connection as any,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
  },
};

export const queues = {
  compliance: new Queue<ComplianceJobPayload>("compliance-queue", queueOptions),
  onboarding: new Queue<OnboardingJobPayload>("onboarding-queue", queueOptions),
  default: new Queue<DefaultJobPayload>("default-queue", queueOptions),
};
