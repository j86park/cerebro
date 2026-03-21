import { describe, it, expect, vi } from "vitest";
import { SimulationOrchestrator } from "../../src/lib/simulation/orchestrator";
import { prisma } from "../../src/lib/db/client";

vi.mock("../../src/lib/db/client", () => ({
  prisma: {
    document: {
      groupBy: vi.fn(),
    },
    agentAction: {
      count: vi.fn(),
    },
    simulationRun: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

describe("SimulationOrchestrator Metrics", () => {
  const orchestrator = new SimulationOrchestrator();

  it("should aggregate and store metrics", async () => {
    vi.mocked(prisma.simulationRun.findUnique).mockResolvedValue({
      id: "run-metrics",
      batchesCompleted: 10,
    } as any);

    vi.mocked(prisma.document.groupBy).mockResolvedValue([
      { status: "VALID", _count: 50 },
      { status: "EXPIRED", _count: 10 },
    ] as any);

    vi.mocked(prisma.agentAction.count).mockResolvedValue(100);

    const metrics = await orchestrator.aggregateMetrics("run-metrics");

    expect(metrics).toBeDefined();
    expect(metrics?.totalActionsTriggered).toBe(100);
    expect(metrics?.documentStatusDistribution).toHaveLength(2);
    expect(prisma.simulationRun.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "run-metrics" },
      data: expect.objectContaining({
        metrics: expect.any(Object)
      })
    }));
  });
});
