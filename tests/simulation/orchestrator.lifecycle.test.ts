import { describe, it, expect, beforeEach, vi } from "vitest";
import { SimulationOrchestrator } from "@/lib/simulation/orchestrator";
import { prisma } from "@/lib/db/client";

// Mock prisma
vi.mock("@/lib/db/client", () => ({
  prisma: {
    simulationRun: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    document: {
      groupBy: vi.fn().mockResolvedValue([]),
    },
    agentAction: {
      count: vi.fn().mockResolvedValue(0),
    },
  },
}));

describe("SimulationOrchestrator Lifecycle", () => {
  let orchestrator: SimulationOrchestrator;

  beforeEach(() => {
    orchestrator = new SimulationOrchestrator();
    vi.clearAllMocks();
  });

  it("should create a simulation run with PENDING status", async () => {
    const mockRun = {
      id: "sim_123",
      clientCount: 10,
      simulatedDays: 30,
      status: "PENDING",
    };

    (prisma.simulationRun.create as any).mockResolvedValue(mockRun);

    const run = await orchestrator.createSimulationRun({
      clientCount: 10,
      simulatedDays: 30,
      clientResponseRate: 0.8,
      advisorResponseRate: 0.9,
    });

    expect(prisma.simulationRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clientCount: 10,
        simulatedDays: 30,
        status: "PENDING",
      }),
    });
    expect(run.id).toBe("sim_123");
  });

  it("should update progress and complete the run", async () => {
    (prisma.simulationRun.update as any).mockResolvedValue({
      id: "sim_123",
      batchesCompleted: 5,
      batchesTotal: 5,
    });
    (prisma.simulationRun as any).updateMany = vi.fn().mockResolvedValue({ count: 1 });

    await orchestrator.incrementProgress("sim_123");

    expect(prisma.simulationRun.update).toHaveBeenCalledWith({
      where: { id: "sim_123" },
      data: expect.objectContaining({
        batchesCompleted: { increment: 1 },
        status: "RUNNING",
      }),
    });
    expect((prisma.simulationRun as any).updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "COMPLETED" }),
    }));
  });

  it("should update progress without completing if batches remaining", async () => {
    (prisma.simulationRun.update as any).mockResolvedValue({
      id: "sim_123",
      batchesCompleted: 3,
      batchesTotal: 5,
    });

    await orchestrator.incrementProgress("sim_123");

    expect(prisma.simulationRun.update).toHaveBeenCalledWith({
      where: { id: "sim_123" },
      data: expect.objectContaining({
        batchesCompleted: { increment: 1 },
        status: "RUNNING",
      }),
    });
  });
});
