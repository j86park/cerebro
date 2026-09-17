import { env } from "@/lib/config";
import {
  DURABLE_ENGINE_THRESHOLDS,
  durableEngineMetricsSchema,
  durableEngineProbeResultSchema,
  type DurableEngineMetrics,
  type DurableEngineProbeResult,
  type DurableEngineVerdict,
} from "./schemas";

export type {
  DurableEngineMetrics,
  DurableEngineProbeResult,
  DurableEngineVerdict,
} from "./schemas";

export {
  DURABLE_ENGINE_THRESHOLDS,
  durableEngineMetricsSchema,
  durableEngineProbeResultSchema,
  durableEngineVerdictSchema,
} from "./schemas";

/**
 * Whether the durable-engine probe flag is on (default false — watch only).
 */
export function isDurableEngineProbeEnabled(): boolean {
  return env.DURABLE_ENGINE_PROBE;
}

/**
 * Scores snapshot/resume pain from load evidence.
 * Pure rules — no Temporal/Inngest clients; Pilot spike only when verdict is spike_temporal.
 */
export function scoreSnapshotPain(
  metricsInput: DurableEngineMetrics,
): DurableEngineProbeResult {
  const metrics = durableEngineMetricsSchema.parse(metricsInput);
  const t = DURABLE_ENGINE_THRESHOLDS;

  if (metrics.clientCount < t.minClientsForDecision) {
    return durableEngineProbeResultSchema.parse({
      verdict: "inconclusive",
      reason: `clientCount ${metrics.clientCount} < ${t.minClientsForDecision} — insufficient evidence for Temporal spike`,
      metrics,
    });
  }

  if (metrics.duplicateSideEffect > t.duplicateSideEffectMax) {
    return durableEngineProbeResultSchema.parse({
      verdict: "spike_temporal",
      reason: `duplicateSideEffect=${metrics.duplicateSideEffect} escaped idempotency at scale — investigate Temporal/Inngest vs ledger bugs`,
      metrics,
    });
  }

  const missRate =
    (metrics.snapshotMiss / Math.max(metrics.clientCount, 1)) * 1000;
  const latencyPain = metrics.resumeLatencyMs >= t.resumeLatencySpikeMs;
  const snapshotPain = missRate >= t.snapshotMissPerThousand;

  if (latencyPain && snapshotPain) {
    return durableEngineProbeResultSchema.parse({
      verdict: "spike_temporal",
      reason: `resumeLatencyMs=${metrics.resumeLatencyMs} and snapshotMiss/1k=${missRate.toFixed(2)} exceed thresholds — Pilot Temporal/Inngest spike justified`,
      metrics,
    });
  }

  if (latencyPain || snapshotPain) {
    return durableEngineProbeResultSchema.parse({
      verdict: "inconclusive",
      reason: `Single pain signal (latencyPain=${latencyPain}, snapshotPain=${snapshotPain}) — gather more 10k-sim evidence before spike`,
      metrics,
    });
  }

  return durableEngineProbeResultSchema.parse({
    verdict: "stay_mastra",
    reason: `No snapshot/resume pain at clientCount=${metrics.clientCount}; stay on Mastra snapshots + BullMQ`,
    metrics,
  });
}
