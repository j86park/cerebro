import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/simulation/start/route";
import { NextRequest } from "next/server";
import { SimulationOrchestrator } from "@/lib/simulation/orchestrator";

vi.mock("@/lib/simulation/orchestrator", () => {
  return {
    SimulationOrchestrator: vi.fn(),
  };
});

describe("POST /api/simulation/start", () => {
  let orchestrator: any;

  beforeEach(() => {
    vi.clearAllMocks();
    orchestrator = new SimulationOrchestrator();
  });

  it("should return 201 and the simulation run on success", async () => {
    const mockRun = { id: "sim_123", status: "PENDING" };
    const mockCreateSimulationRun = vi.fn().mockResolvedValue(mockRun);
    
    vi.mocked(SimulationOrchestrator).mockImplementation(function() {
      return {
        createSimulationRun: mockCreateSimulationRun,
      };
    } as any);

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
    expect(data.id).toBe("sim_123");
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
