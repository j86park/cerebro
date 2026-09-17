import { z } from "zod";

/**
 * Evidence metrics for Temporal/Inngest go/no-go (SOTA P2.1 watch).
 * No Temporal SDK — probe only; Mastra snapshots remain default durability.
 */
export const durableEngineMetricsSchema = z.object({
  /** Simulated or measured client count in the stress window. */
  clientCount: z.number().int().min(0),
  /** p95 (or similar) resume latency after HITL / worker restart. */
  resumeLatencyMs: z.number().min(0),
  /** Count of Mastra snapshot misses recovered from EscalationState. */
  snapshotMiss: z.number().int().min(0),
  /** Duplicate side-effect attempts that escaped idempotency (should be 0). */
  duplicateSideEffect: z.number().int().min(0),
  /** Peak BullMQ backlog depth observed. */
  queueBacklog: z.number().int().min(0),
});

export type DurableEngineMetrics = z.infer<typeof durableEngineMetricsSchema>;

export const durableEngineVerdictSchema = z.enum([
  "stay_mastra",
  "spike_temporal",
  "inconclusive",
]);

export type DurableEngineVerdict = z.infer<typeof durableEngineVerdictSchema>;

export const durableEngineProbeResultSchema = z.object({
  verdict: durableEngineVerdictSchema,
  reason: z.string().min(1),
  metrics: durableEngineMetricsSchema,
});

export type DurableEngineProbeResult = z.infer<
  typeof durableEngineProbeResultSchema
>;

/** Thresholds documented for the watch probe (not production SLOs). */
export const DURABLE_ENGINE_THRESHOLDS = {
  /** Below this clientCount, evidence is too thin → inconclusive. */
  minClientsForDecision: 1_000,
  /** Resume latency above this (ms) at scale suggests Temporal spike. */
  resumeLatencySpikeMs: 30_000,
  /** Snapshot misses above this rate (per 1k clients) suggest pain. */
  snapshotMissPerThousand: 5,
  /** Any duplicate side effect at scale → spike consideration. */
  duplicateSideEffectMax: 0,
  /** Queue backlog depth that alone is not Temporal-worthy without latency. */
  queueBacklogWarn: 10_000,
} as const;
