import { describe, it, expect, vi } from "vitest";

// Mock infrastructure dependencies before importing workers
vi.mock("ioredis", () => {
  return {
    default: vi.fn().mockImplementation(function() {
      return {
        on: vi.fn(),
        quit: vi.fn().mockResolvedValue("OK"),
      };
    }),
  };
});

vi.mock("bullmq", () => {
  return {
    Worker: vi.fn().mockImplementation(function() {
      return {
        on: vi.fn(),
      };
    }),
    Queue: vi.fn(),
    Job: vi.fn(),
  };
});

// Use vi.hoisted to ensure these are available to vi.mock
const { mockTick, mockUpdateProgress, mockGetRun } = vi.hoisted(() => ({
  mockTick: vi.fn().mockResolvedValue({ simDate: new Date(), clientCount: 10 }),
  mockUpdateProgress: vi.fn().mockResolvedValue({}),
  mockGetRun: vi.fn().mockResolvedValue({ id: "run-123", simulatedDays: 30 }),
}));

vi.mock("@/lib/simulation/orchestrator", () => {
  return {
    SimulationOrchestrator: vi.fn().mockImplementation(function() {
      return {
        tick: mockTick,
        updateProgress: mockUpdateProgress,
        getRun: mockGetRun,
      };
    }),
  };
});

import { processSimulationJob } from "../../src/lib/queue/workers";

describe("Simulation Worker Execution", () => {
  it("should process simulation batch and update progress for each day", async () => {
    const mockJob: any = {
      id: "job-1",
      data: {
        runId: "run-123",
        batchStart: 0,
        batchEnd: 2,
      },
    };

    const result = await processSimulationJob(mockJob);

    expect(result.success).toBe(true);
    expect(mockTick).toHaveBeenCalledTimes(3);
    expect(mockUpdateProgress).toHaveBeenCalledTimes(3);
  });
});
