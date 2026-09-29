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
      groupBy: vi.fn(),
    },
    escalationState: {
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
      clientCount: 100,
      startedAt: new Date("2026-09-28T00:00:00.000Z"),
    } as any);

    vi.mocked(prisma.document.groupBy)
      .mockResolvedValueOnce([
        { status: "VALID", _count: 50 },
        { status: "EXPIRED", _count: 10 },
      ] as any)
      .mockResolvedValueOnce([{ clientId: "CLT-1" }] as any);

    vi.mocked(prisma.agentAction.count).mockResolvedValue(100);
    vi.mocked(prisma.agentAction.groupBy)
      .mockResolvedValueOnce([{ clientId: "CLT-2" }] as any)
      .mockResolvedValueOnce([{ actionType: "SEND_CLIENT_REMINDER", _count: 2 }] as any);
    vi.mocked(prisma.escalationState.count).mockResolvedValue(1);

    const metrics = await orchestrator.aggregateMetrics("run-metrics");

    expect(metrics).toBeDefined();
    expect(metrics?.totalActionsTriggered).toBe(100);
    expect(metrics?.simulatedDaysProcessed).toBe(10);
    expect(metrics?.documentsNeedingAttention).toBe(10);
    expect(metrics?.onboardingCompletedByAgent).toBe(1);
    expect(metrics?.documentStatusDistribution).toHaveLength(2);
    expect(prisma.simulationRun.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "run-metrics" },
      data: expect.objectContaining({
        metrics: expect.any(Object)
      })
    }));
  });
});
