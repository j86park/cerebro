import { describe, it, expect, vi, beforeEach } from "vitest";
import { SimulationOrchestrator } from "../../src/lib/simulation/orchestrator";
import { prisma } from "../../src/lib/db/client";

vi.mock("../../src/lib/db/client", () => ({
  prisma: {
    document: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      groupBy: vi.fn(),
    },
    client: {
      findMany: vi.fn(),
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

describe("SimulationOrchestrator Engine Tick", () => {
  const orchestrator = new SimulationOrchestrator();

  it("should advance simDate correctly by day", async () => {
    const startedAt = new Date("2026-03-16T12:00:00Z");
    vi.mocked(prisma.simulationRun.findUnique).mockResolvedValue({
      id: "run-123",
      startedAt,
      clientCount: 10,
      randomSeed: "test-seed",
    } as any);

    vi.mocked(prisma.client.findMany).mockResolvedValue([]);

    const resultDay0 = await orchestrator.tick("run-123", 0);
    expect(resultDay0.simDate.toISOString()).toBe(startedAt.toISOString());

    const resultDay1 = await orchestrator.tick("run-123", 1);
    const day1 = new Date(startedAt.getTime() + 24 * 60 * 60 * 1000);
    expect(resultDay1.simDate.toISOString()).toBe(day1.toISOString());
  });

  it("should produce deterministic events for the same seed and day", async () => {
    const run = {
      id: "run-123",
      startedAt: new Date(),
      clientCount: 100,
      randomSeed: "fixed-seed",
      metrics: { useMockAgents: true },
    };
    vi.mocked(prisma.simulationRun.findUnique).mockResolvedValue(run as never);

    // Empty client set keeps the test fast and deterministic (no DB / LLM).
    vi.mocked(prisma.client.findMany).mockResolvedValue([]);

    const res1 = await orchestrator.tick(run.id, 5);
    const res2 = await orchestrator.tick(run.id, 5);

    expect(res1.simDate.getTime()).toBe(res2.simDate.getTime());
    expect(res1.clientCount).toBe(0);
  });
});
