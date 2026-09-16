import { z } from "zod";
import { env } from "@/lib/config";

/** Live agent job triggers — includes pKYC-lite event taxonomy (WP-P1.1). */
export const agentTriggerSchema = z.enum([
  "SCHEDULED",
  "EVENT_UPLOAD",
  "MANUAL",
  "EVENT_EXPIRY_PROXIMITY",
  "EVENT_RISK_TIER_CHANGE",
  "EVENT_PROFILE_MATERIAL_CHANGE",
  /** Stub hook for future sanctions/PEP vendor feeds — never calls an LLM to route. */
  "EVENT_SANCTIONS_PEP",
]);

export type AgentTrigger = z.infer<typeof agentTriggerSchema>;

/**
 * Payload for all live agent jobs (priority + scheduled queues).
 * Validated with Zod before every enqueue.
 * EVENT_UPLOAD / EVENT_EXPIRY_PROXIMITY require documentId.
 * Risk / profile / sanctions-stub events require eventKey for deterministic jobIds.
 */
export const agentJobSchema = z
  .object({
    clientId: z.string().min(1),
    agentType: z.enum(["COMPLIANCE", "ONBOARDING"]),
    trigger: agentTriggerSchema,
    documentId: z.string().min(1).optional(),
    /**
     * Stable suffix for pKYC event jobIds (e.g. risk tier pair or sorted material field names).
     * Must be URL/BullMQ-safe: alphanumeric, hyphen, underscore only.
     */
    eventKey: z
      .string()
      .min(1)
      .regex(/^[A-Za-z0-9_-]+$/, "eventKey must be alphanumeric / hyphen / underscore")
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (
      (value.trigger === "EVENT_UPLOAD" ||
        value.trigger === "EVENT_EXPIRY_PROXIMITY") &&
      !value.documentId
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `documentId is required when trigger is ${value.trigger}`,
        path: ["documentId"],
      });
    }
    if (
      (value.trigger === "EVENT_RISK_TIER_CHANGE" ||
        value.trigger === "EVENT_PROFILE_MATERIAL_CHANGE" ||
        value.trigger === "EVENT_SANCTIONS_PEP") &&
      !value.eventKey
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `eventKey is required when trigger is ${value.trigger}`,
        path: ["eventKey"],
      });
    }
  });

export type AgentJobPayload = z.infer<typeof agentJobSchema>;

/**
 * Payload for simulation batch jobs (simulation queue only).
 */
export const simulationJobSchema = z.object({
  runId: z.string().min(1),
  batchStart: z.number().int().nonnegative(),
  batchEnd: z.number().int().nonnegative(),
  clientStart: z.number().int().nonnegative().optional(),
  clientEnd: z.number().int().nonnegative().optional(),
});

export type SimulationJobPayload = z.infer<typeof simulationJobSchema>;

/**
 * Calendar day key from DEMO_DATE for scan/manual/pKYC jobId stability.
 * Uses the date portion only so wall-clock time inside DEMO_DATE does not fragment keys.
 */
export function demoDateKey(): string {
  return env.DEMO_DATE.slice(0, 10);
}

/**
 * Builds a deterministic BullMQ jobId for a live agent payload.
 * Patterns: scan / upload / manual / expiry / risk / profile / sanctions.
 * Agent type is part of the key because COMPLIANCE and ONBOARDING are separate jobs.
 */
export function buildAgentJobId(payload: AgentJobPayload): string {
  const parsed = agentJobSchema.parse(payload);
  const dateKey = demoDateKey();

  switch (parsed.trigger) {
    case "EVENT_UPLOAD":
      return `upload:${parsed.clientId}:${parsed.documentId}:${parsed.agentType}`;
    case "SCHEDULED":
      return `scan:${parsed.clientId}:${dateKey}:${parsed.agentType}`;
    case "MANUAL":
      return `manual:${parsed.clientId}:${dateKey}:${parsed.agentType}`;
    case "EVENT_EXPIRY_PROXIMITY":
      return `expiry:${parsed.clientId}:${parsed.documentId}:${dateKey}:${parsed.agentType}`;
    case "EVENT_RISK_TIER_CHANGE":
      return `risk:${parsed.clientId}:${parsed.eventKey}:${dateKey}:${parsed.agentType}`;
    case "EVENT_PROFILE_MATERIAL_CHANGE":
      return `profile:${parsed.clientId}:${parsed.eventKey}:${dateKey}:${parsed.agentType}`;
    case "EVENT_SANCTIONS_PEP":
      return `sanctions:${parsed.clientId}:${parsed.eventKey}:${dateKey}:${parsed.agentType}`;
  }
}

/**
 * Retention for completed/failed agent jobs.
 * Age-based windows keep jobIds in Redis long enough that daily scan and
 * upload dedupe remain meaningful (immediate removeOnComplete:true breaks dedupe).
 */
export const agentJobRetentionOptions = {
  removeOnComplete: {
    /** 48h — covers DEMO_DATE scan keys across a full day boundary. */
    age: 60 * 60 * 48,
    count: 5000,
  },
  removeOnFail: {
    age: 60 * 60 * 24 * 7,
    count: 2000,
  },
} as const;

/** Outcome written when an agent job finishes successfully (processor idempotency marker). */
export const AGENT_JOB_COMPLETED_OUTCOME = "AGENT_RUN_COMPLETED";

/** Outcome written when a replayed job is skipped because a prior run already completed. */
export const AGENT_JOB_SKIPPED_OUTCOME = "JOB_IDEMPOTENT_SKIP";

/**
 * Returns true when a BullMQ add() failure is a duplicate jobId collision.
 */
export function isDuplicateJobIdError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("already exists") ||
    (message.includes("jobid") && message.includes("exist")) ||
    (error as { name?: string }).name === "JobIdAlreadyExistsError"
  );
}
