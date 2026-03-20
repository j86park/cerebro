import { describe, expect, it, vi, beforeEach } from "vitest";

const add = vi.fn().mockResolvedValue({});

vi.mock("@/lib/queue/client", () => ({
  queues: {
    scheduled: { add },
  },
  connection: {},
}));

vi.mock("@/lib/db/client", () => ({
  prisma: {
    client: {
      findMany: vi.fn().mockResolvedValue([{ id: "CLT-001" }, { id: "CLT-002" }]),
    },
  },
}));

describe("enqueueScheduledAgentScansForAllClients", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("enqueues COMPLIANCE and ONBOARDING jobs to cerebro-scheduled for each client", async () => {
    const { enqueueScheduledAgentScansForAllClients } = await import(
      "@/lib/queue/scheduler"
    );

    const result = await enqueueScheduledAgentScansForAllClients();

    expect(result.clientCount).toBe(2);
    expect(result.enqueued).toBe(4);
    expect(add).toHaveBeenCalledTimes(4);

    const payloads = add.mock.calls.map((c) => c[1]);
    for (const p of payloads) {
      expect(p).toMatchObject({ trigger: "SCHEDULED" });
      expect(["COMPLIANCE", "ONBOARDING"]).toContain(p.agentType);
      expect(p.clientId).toMatch(/^CLT-/);
    }
  });
});
