import { describe, expect, it, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/simulation/[runId]/route";

const getRun = vi.fn();

vi.mock("@/lib/simulation/orchestrator", () => ({
  SimulationOrchestrator: class {
    getRun = getRun;
  },
}));

describe("GET /api/simulation/[runId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when run missing", async () => {
    getRun.mockResolvedValueOnce(null);
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ runId: "missing" }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 200 with data envelope for a run", async () => {
    getRun.mockResolvedValueOnce({
      id: "run-1",
      status: "COMPLETED",
      clientCount: 10,
      simulatedDays: 5,
      metrics: {},
    });
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ runId: "run-1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe("run-1");
  });
});
