import { describe, it, expect, vi, beforeEach } from "vitest";
import { processSimulationJob } from "../../src/lib/queue/workers";
import { SimulationOrchestrator } from "../../src/lib/simulation/orchestrator";

const mockTick = vi.fn().mockResolvedValue({ simDate: new Date(), clientCount: 10 });
const mockUpdateProgress = vi.fn().mockResolvedValue({});
const mockGetRun = vi.fn().mockResolvedValue({ id: "run-123", simulatedDays: 30 });

vi.mock("../../src/lib/simulation/orchestrator", () => {
  return {
    SimulationOrchestrator: function() {
      return {
        tick: mockTick,
        updateProgress: mockUpdateProgress,
        getRun: mockGetRun,
      };
    }
  };
});

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
