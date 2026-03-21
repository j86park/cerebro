import { describe, expect, it, beforeEach } from "vitest";
import {
  getQueueMetricsSnapshot,
  recordJobCompleted,
  recordJobFailed,
  resetQueueMetricsForTests,
} from "@/lib/queue/metrics";

describe("queue metrics", () => {
  beforeEach(() => {
    resetQueueMetricsForTests();
  });

  it("increments completed and failed per queue name", () => {
    recordJobCompleted("cerebro-priority");
    recordJobCompleted("cerebro-scheduled");
    recordJobFailed("cerebro-simulation");

    const snap = getQueueMetricsSnapshot();
    expect(snap.priorityCompleted).toBe(1);
    expect(snap.scheduledCompleted).toBe(1);
    expect(snap.simulationFailed).toBe(1);
  });
});
