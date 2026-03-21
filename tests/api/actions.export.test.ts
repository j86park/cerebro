import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/vaults/[clientId]/actions/export/route";

const vaultExists = vi.fn();
const getActionHistory = vi.fn();

vi.mock("@/lib/db/vault-service", () => ({
  VaultService: class {
    constructor(public ctx: { clientId: string }) {}
    vaultExists = vaultExists;
    getActionHistory = getActionHistory;
  },
}));

describe("GET /api/vaults/[clientId]/actions/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns CSV rows for seeded-style actions", async () => {
    vaultExists.mockResolvedValue(true);
    getActionHistory.mockResolvedValue([
      {
        id: "a1",
        performedAt: new Date("2025-01-01T00:00:00.000Z"),
        agentType: "COMPLIANCE",
        actionType: "SCAN_VAULT",
        trigger: "SCHEDULED",
        outcome: "OK",
        reasoning: "test",
      },
    ]);

    const req = new NextRequest("http://localhost/api/vaults/CLT-001/actions/export");
    const res = await GET(req, {
      params: Promise.resolve({ clientId: "CLT-001" }),
    });

    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("id,performedAt,agentType");
    expect(text).toContain("a1");
  });
});
