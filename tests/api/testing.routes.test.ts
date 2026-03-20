import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET as GETLatest } from "@/app/api/testing/latest/route";
import { GET as GETRuns } from "@/app/api/testing/runs/route";
import { GET as GETRunById } from "@/app/api/testing/runs/[runId]/route";

const {
  evalRunFindFirst,
  evalRunFindMany,
  evalRunFindUnique,
} = vi.hoisted(() => ({
  evalRunFindFirst: vi.fn(),
  evalRunFindMany: vi.fn(),
  evalRunFindUnique: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  prisma: {
    evalRun: {
      findFirst: evalRunFindFirst,
      findMany: evalRunFindMany,
      findUnique: evalRunFindUnique,
    },
  },
}));

describe("testing API envelopes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET /api/testing/latest returns { data } on success", async () => {
    evalRunFindFirst.mockResolvedValueOnce({
      id: "e1",
      overallScore: 0.9,
      scenarioResults: {},
      scorerBreakdown: {},
      runAt: new Date(),
      gitCommit: null,
    });
    const res = await GETLatest();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe("e1");
  });

  it("GET /api/testing/runs returns { data: array }", async () => {
    evalRunFindMany.mockResolvedValueOnce([]);
    const res = await GETRuns();
    const body = await res.json();
    expect(body.data).toEqual([]);
  });

  it("GET /api/testing/runs/[runId] returns { data }", async () => {
    evalRunFindUnique.mockResolvedValueOnce({
      id: "e1",
      overallScore: 1,
      scenarioResults: {},
      scorerBreakdown: {},
      runAt: new Date(),
      gitCommit: null,
    });
    const res = await GETRunById(new NextRequest("http://x"), {
      params: Promise.resolve({ runId: "e1" }),
    });
    const body = await res.json();
    expect(body.data.id).toBe("e1");
  });
});
