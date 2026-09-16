import { describe, expect, it, vi, beforeEach } from "vitest";

const add = vi.fn().mockResolvedValue({ id: "job-1" });
const getJob = vi.fn().mockResolvedValue(null);
const documentFindMany = vi.fn().mockResolvedValue([]);

vi.mock("@/lib/queue/client", () => ({
  queues: {
    scheduled: { add, getJob },
    priority: { add, getJob },
  },
  connection: {},
}));

vi.mock("@/lib/db/client", () => ({
  prisma: {
    client: {
      findMany: vi.fn().mockResolvedValue([{ id: "CLT-001" }, { id: "CLT-002" }]),
    },
    document: {
      findMany: (...args: unknown[]) => documentFindMany(...args),
    },
  },
}));

vi.mock("@/lib/config", () => ({
  env: {
    DEMO_DATE: "2026-09-16T12:00:00.000Z",
    DRY_RUN: true,
  },
}));

describe("enqueueScheduledAgentScansForAllClients", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getJob.mockResolvedValue(null);
    add.mockResolvedValue({ id: "job-1" });
    documentFindMany.mockResolvedValue([]);
  });

  it("enqueues COMPLIANCE and ONBOARDING jobs to cerebro-scheduled for each client", async () => {
    const { enqueueScheduledAgentScansForAllClients } = await import(
      "@/lib/queue/scheduler"
    );

    const result = await enqueueScheduledAgentScansForAllClients();

    expect(result.clientCount).toBe(2);
    expect(result.enqueued).toBe(4);
    expect(result.deduplicated).toBe(0);
    expect(add).toHaveBeenCalledTimes(4);

    const payloads = add.mock.calls.map((c) => c[1]);
    for (const p of payloads) {
      expect(p).toMatchObject({ trigger: "SCHEDULED" });
      expect(["COMPLIANCE", "ONBOARDING"]).toContain(p.agentType);
      expect(p.clientId).toMatch(/^CLT-/);
    }

    const jobIds = add.mock.calls.map((c) => c[2]?.jobId as string);
    expect(jobIds).toContain("scan:CLT-001:2026-09-16_COMPLIANCE");
    expect(jobIds).toContain("scan:CLT-001:2026-09-16_ONBOARDING");
    expect(jobIds).toContain("scan:CLT-002:2026-09-16_COMPLIANCE");
    expect(jobIds).toContain("scan:CLT-002:2026-09-16_ONBOARDING");
  });

  it("counts existing jobIds as deduplicated instead of enqueued", async () => {
    getJob
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "scan:CLT-001:2026-09-16_ONBOARDING" })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    const { enqueueScheduledAgentScansForAllClients } = await import(
      "@/lib/queue/scheduler"
    );

    const result = await enqueueScheduledAgentScansForAllClients();
    expect(result.enqueued).toBe(3);
    expect(result.deduplicated).toBe(1);
    expect(add).toHaveBeenCalledTimes(3);
  });
});

describe("enqueueScheduledScansAndPkycTriggers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getJob.mockResolvedValue(null);
    add.mockResolvedValue({ id: "job-1" });
  });

  it("enqueues scheduled scans plus only Compliance expiry jobs", async () => {
    documentFindMany.mockResolvedValue([{ id: "doc-x", clientId: "CLT-001" }]);

    const { enqueueScheduledScansAndPkycTriggers } = await import(
      "@/lib/queue/scheduler"
    );
    const result = await enqueueScheduledScansAndPkycTriggers();

    expect(result.scheduled.enqueued).toBe(4);
    expect(result.expiryProximity.enqueued).toBe(1);
    expect(result.expiryProximity.documentCount).toBe(1);

    const payloads = add.mock.calls.map((c) => c[1]);
    const expiryJobs = payloads.filter(
      (p) => p.trigger === "EVENT_EXPIRY_PROXIMITY"
    );
    expect(expiryJobs).toHaveLength(1);
    expect(expiryJobs[0]).toMatchObject({
      agentType: "COMPLIANCE",
      documentId: "doc-x",
    });
    // No LLM manager — only the deterministic Compliance target.
    expect(
      payloads.filter((p) => p.trigger === "EVENT_EXPIRY_PROXIMITY")
    ).not.toContainEqual(expect.objectContaining({ agentType: "ONBOARDING" }));
  });
});
