import { describe, it, expect, vi, beforeEach } from "vitest";
import { processSimulationJob, workers } from "../../src/lib/queue/workers";
import { SimulationOrchestrator } from "../../src/lib/simulation/orchestrator";

// Mock the orchestrator
vi.mock("../../src/lib/simulation/orchestrator");

describe("Worker Performance Benchmark", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default mocks for orchestrator
    const mockOrchestrator = (SimulationOrchestrator as any).prototype;
    mockOrchestrator.getRun.mockResolvedValue({ id: "run-perf", simulatedDays: 10 });
    mockOrchestrator.tick.mockResolvedValue({ simDate: new Date(), eventsTriggered: 1 });
    mockOrchestrator.updateProgress.mockResolvedValue({});
  });

  it("should process simulation jobs with high throughput (> 10 jobs/sec equivalent)", async () => {
    const runId = "run-perf";
    const batchSize = 10;
    const iterations = 5; // 50 "days" worth of work
    
    const startTime = Date.now();
    
    for (let i = 0; i < iterations; i++) {
        const batchStart = i * batchSize;
        const batchEnd = batchStart + batchSize - 1;
        
        const job = {
            id: `job-${i}`,
            data: {
                runId,
                batchStart,
                batchEnd,
            }
        } as any;
        
        await processSimulationJob(job);
    }
    
    const totalElapsed = (Date.now() - startTime) / 1000;
    const totalDays = iterations * batchSize;
    const throughput = totalDays / totalElapsed;
    
    console.log(`[Benchmark] Processed ${totalDays} simulated days in ${totalElapsed.toFixed(2)}s (${throughput.toFixed(2)} days/sec)`);
    
    // Assert throughput target
    // Note: Since we are mocking the orchestrator, this tests the worker loop and metrics overhead.
    // In a real environment, this would also include DB latency.
    expect(throughput).toBeGreaterThan(10);
  });
});
