import { describe, expect, it } from "vitest";
import {
  DURABLE_ENGINE_THRESHOLDS,
  isDurableEngineProbeEnabled,
  scoreSnapshotPain,
} from "@/lib/orchestration";

describe("durableEngineProbe (SOTA P2.1 watch)", () => {
  it("defaults disabled", () => {
    expect(isDurableEngineProbeEnabled()).toBe(false);
  });

  it("inconclusive below min client count", () => {
    const result = scoreSnapshotPain({
      clientCount: 100,
      resumeLatencyMs: 60_000,
      snapshotMiss: 100,
      duplicateSideEffect: 0,
      queueBacklog: 50_000,
    });
    expect(result.verdict).toBe("inconclusive");
    expect(result.reason).toMatch(/insufficient evidence/i);
  });

  it("stay_mastra when healthy at scale", () => {
    const result = scoreSnapshotPain({
      clientCount: 10_000,
      resumeLatencyMs: 1_200,
      snapshotMiss: 2,
      duplicateSideEffect: 0,
      queueBacklog: 100,
    });
    expect(result.verdict).toBe("stay_mastra");
  });

  it("spike_temporal on latency + snapshot pain", () => {
    const result = scoreSnapshotPain({
      clientCount: 10_000,
      resumeLatencyMs: DURABLE_ENGINE_THRESHOLDS.resumeLatencySpikeMs,
      snapshotMiss: 100,
      duplicateSideEffect: 0,
      queueBacklog: 500,
    });
    expect(result.verdict).toBe("spike_temporal");
  });

  it("spike_temporal on duplicate side effects", () => {
    const result = scoreSnapshotPain({
      clientCount: 5_000,
      resumeLatencyMs: 500,
      snapshotMiss: 0,
      duplicateSideEffect: 1,
      queueBacklog: 10,
    });
    expect(result.verdict).toBe("spike_temporal");
    expect(result.reason).toMatch(/duplicateSideEffect/i);
  });
});
