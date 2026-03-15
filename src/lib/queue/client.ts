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

export const queues = {
  compliance: new Queue<ComplianceJobPayload>("compliance-queue", { connection: connection as any }),
  onboarding: new Queue<OnboardingJobPayload>("onboarding-queue", { connection: connection as any }),
  default: new Queue<DefaultJobPayload>("default-queue", { connection: connection as any }),
};
