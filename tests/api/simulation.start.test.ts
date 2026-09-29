import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/simulation/start/route";
import { NextRequest } from "next/server";
import { SimulationOrchestrator } from "@/lib/simulation/orchestrator";
import { startSimulationRun } from "@/lib/simulation/start";

vi.mock("@/lib/simulation/start", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/simulation/start")>();
  return { ...actual, startSimulationRun: vi.fn() };
});

describe("POST /api/simulation/start", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 201 and the simulation run on success", async () => {
    const mockRun = { id: "sim_123", status: "PENDING" };
    vi.mocked(startSimulationRun).mockResolvedValue({ run: mockRun as never, jobsEnqueued: 3 });

    const body = {
      clientCount: 10,
      simulatedDays: 30,
      clientResponseRate: 0.8,
      advisorResponseRate: 0.9,
    };

    const req = new NextRequest("http://localhost:3000/api/simulation/start", {
      method: "POST",
      body: JSON.stringify(body),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.data.run.id).toBe("sim_123");
    expect(data.data.jobsEnqueued).toBe(3);
  });

  it("should return 400 for invalid clientCount", async () => {
    const body = {
      clientCount: -5,
      simulatedDays: 30,
    };

    const req = new NextRequest("http://localhost:3000/api/simulation/start", {
      method: "POST",
      body: JSON.stringify(body),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
