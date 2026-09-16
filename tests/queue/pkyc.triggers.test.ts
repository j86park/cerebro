import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/config", () => ({
  env: {
    DEMO_DATE: "2026-09-16T12:00:00.000Z",
    REDIS_URL: "redis://localhost:6379",
    NODE_ENV: "test",
    DRY_RUN: true,
  },
}));

describe("routePkycEvent (deterministic — no LLM)", () => {
  it("routes expiry proximity to Compliance on priority", async () => {
    const { routePkycEvent } = await import("@/lib/queue/pkycRouter");
    expect(routePkycEvent({ trigger: "EVENT_EXPIRY_PROXIMITY" })).toEqual({
      agentTypes: ["COMPLIANCE"],
      queue: "priority",
    });
  });

  it("routes risk-tier change to Compliance on priority", async () => {
    const { routePkycEvent } = await import("@/lib/queue/pkycRouter");
    expect(routePkycEvent({ trigger: "EVENT_RISK_TIER_CHANGE" })).toEqual({
      agentTypes: ["COMPLIANCE"],
      queue: "priority",
    });
  });

  it("routes material profile change to Onboarding when not completed", async () => {
    const { routePkycEvent } = await import("@/lib/queue/pkycRouter");
    expect(
      routePkycEvent({
        trigger: "EVENT_PROFILE_MATERIAL_CHANGE",
        onboardingStatus: "IN_PROGRESS",
      })
    ).toEqual({ agentTypes: ["ONBOARDING"], queue: "priority" });
  });

  it("routes material profile change to Compliance when onboarding completed", async () => {
    const { routePkycEvent } = await import("@/lib/queue/pkycRouter");
    expect(
      routePkycEvent({
        trigger: "EVENT_PROFILE_MATERIAL_CHANGE",
        onboardingStatus: "COMPLETED",
      })
    ).toEqual({ agentTypes: ["COMPLIANCE"], queue: "priority" });
  });

  it("routes sanctions stub to Compliance on priority", async () => {
    const { routePkycEvent } = await import("@/lib/queue/pkycRouter");
    expect(routePkycEvent({ trigger: "EVENT_SANCTIONS_PEP" })).toEqual({
      agentTypes: ["COMPLIANCE"],
      queue: "priority",
    });
  });
});

describe("buildAgentJobId pKYC patterns", () => {
  it("builds expiry / risk / profile / sanctions jobIds", async () => {
    const { buildAgentJobId } = await import("@/lib/queue/jobs");

    expect(
      buildAgentJobId({
        clientId: "CLT-001",
        agentType: "COMPLIANCE",
        trigger: "EVENT_EXPIRY_PROXIMITY",
        documentId: "doc-9",
      })
    ).toBe("expiry:CLT-001:doc-9_2026-09-16_COMPLIANCE");

    expect(
      buildAgentJobId({
        clientId: "CLT-001",
        agentType: "COMPLIANCE",
        trigger: "EVENT_RISK_TIER_CHANGE",
        eventKey: "MODERATE-to-AGGRESSIVE",
      })
    ).toBe("risk:CLT-001:MODERATE-to-AGGRESSIVE_2026-09-16_COMPLIANCE");

    expect(
      buildAgentJobId({
        clientId: "CLT-002",
        agentType: "ONBOARDING",
        trigger: "EVENT_PROFILE_MATERIAL_CHANGE",
        eventKey: "email-name",
      })
    ).toBe("profile:CLT-002:email-name_2026-09-16_ONBOARDING");

    expect(
      buildAgentJobId({
        clientId: "CLT-003",
        agentType: "COMPLIANCE",
        trigger: "EVENT_SANCTIONS_PEP",
        eventKey: "hit_abc",
      })
    ).toBe("sanctions:CLT-003:hit_abc_2026-09-16_COMPLIANCE");
  });

  it("rejects pKYC payloads missing required keys", async () => {
    const { agentJobSchema } = await import("@/lib/queue/jobs");
    expect(
      agentJobSchema.safeParse({
        clientId: "CLT-001",
        agentType: "COMPLIANCE",
        trigger: "EVENT_EXPIRY_PROXIMITY",
      }).success
    ).toBe(false);
    expect(
      agentJobSchema.safeParse({
        clientId: "CLT-001",
        agentType: "COMPLIANCE",
        trigger: "EVENT_RISK_TIER_CHANGE",
      }).success
    ).toBe(false);
  });
});

describe("classifyProfileChange", () => {
  it("detects risk-tier and material field changes separately", async () => {
    const { classifyProfileChange } = await import("@/lib/queue/pkycTriggers");
    const result = classifyProfileChange(
      {
        name: "Alex",
        email: "a@ex.com",
        accountType: "TFSA",
        riskProfile: "MODERATE",
      },
      {
        name: "Alex Chen",
        email: "a@ex.com",
        accountType: "TFSA",
        riskProfile: "AGGRESSIVE",
      }
    );
    expect(result.riskTierChanged).toBe(true);
    expect(result.previousRisk).toBe("MODERATE");
    expect(result.newRisk).toBe("AGGRESSIVE");
    expect(result.materialFields).toEqual(["name"]);
  });

  it("skips non-material noise", async () => {
    const { classifyProfileChange } = await import("@/lib/queue/pkycTriggers");
    const result = classifyProfileChange(
      { name: "Alex", onboardingStatus: "IN_PROGRESS" },
      { name: "Alex", onboardingStatus: "COMPLETED" }
    );
    expect(result.riskTierChanged).toBe(false);
    expect(result.materialFields).toEqual([]);
  });
});

describe("enqueueExpiryProximityTriggers", () => {
  const add = vi.fn().mockResolvedValue({ id: "job-1" });
  const getJob = vi.fn().mockResolvedValue(null);
  const findMany = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    getJob.mockResolvedValue(null);
    add.mockResolvedValue({ id: "job-1" });

    vi.doMock("@/lib/config", () => ({
      env: {
        DEMO_DATE: "2026-09-16T12:00:00.000Z",
        DRY_RUN: true,
      },
    }));
    vi.doMock("@/lib/queue/client", () => ({
      queues: {
        priority: { add, getJob },
        scheduled: { add, getJob },
      },
      connection: {},
    }));
    vi.doMock("@/lib/db/client", () => ({
      prisma: {
        document: { findMany },
      },
    }));
  });

  it("enqueues only Compliance expiry jobs for docs in the DEMO_DATE window", async () => {
    findMany.mockResolvedValue([
      { id: "doc-near", clientId: "CLT-001" },
      { id: "doc-near-2", clientId: "CLT-002" },
    ]);

    const { enqueueExpiryProximityTriggers } = await import(
      "@/lib/queue/pkycTriggers"
    );
    const result = await enqueueExpiryProximityTriggers();

    expect(result.documentCount).toBe(2);
    expect(result.enqueued).toBe(2);
    expect(add).toHaveBeenCalledTimes(2);

    const payloads = add.mock.calls.map((c) => c[1]);
    for (const p of payloads) {
      expect(p.trigger).toBe("EVENT_EXPIRY_PROXIMITY");
      expect(p.agentType).toBe("COMPLIANCE");
    }

    const jobIds = add.mock.calls.map((c) => c[2]?.jobId as string);
    expect(jobIds).toContain("expiry:CLT-001:doc-near_2026-09-16_COMPLIANCE");
    expect(jobIds).toContain("expiry:CLT-002:doc-near-2_2026-09-16_COMPLIANCE");

    // Prisma query must pin the window to DEMO_DATE (not wall clock).
    const where = findMany.mock.calls[0]?.[0]?.where;
    expect(where.expiryDate.gte).toEqual(new Date("2026-09-16T12:00:00.000Z"));
    expect(where.expiryDate.lte).toEqual(
      new Date(
        new Date("2026-09-16T12:00:00.000Z").getTime() + 30 * 24 * 60 * 60 * 1000
      )
    );
  });

  it("does not enqueue when no documents are in window", async () => {
    findMany.mockResolvedValue([]);
    const { enqueueExpiryProximityTriggers } = await import(
      "@/lib/queue/pkycTriggers"
    );
    const result = await enqueueExpiryProximityTriggers();
    expect(result.enqueued).toBe(0);
    expect(add).not.toHaveBeenCalled();
  });
});

describe("enqueuePkycProfileChangeEvents", () => {
  const add = vi.fn().mockResolvedValue({ id: "job-1" });
  const getJob = vi.fn().mockResolvedValue(null);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    getJob.mockResolvedValue(null);
    add.mockResolvedValue({ id: "job-1" });

    vi.doMock("@/lib/config", () => ({
      env: {
        DEMO_DATE: "2026-09-16T12:00:00.000Z",
        DRY_RUN: true,
      },
    }));
    vi.doMock("@/lib/queue/client", () => ({
      queues: {
        priority: { add, getJob },
      },
      connection: {},
    }));
    vi.doMock("@/lib/db/client", () => ({
      prisma: {},
    }));
  });

  it("enqueues risk + profile jobs to expected agent types only", async () => {
    const { enqueuePkycProfileChangeEvents } = await import(
      "@/lib/queue/pkycTriggers"
    );

    const result = await enqueuePkycProfileChangeEvents({
      clientId: "CLT-010",
      before: {
        name: "Pat",
        email: "pat@ex.com",
        accountType: "RRSP",
        riskProfile: "CONSERVATIVE",
        onboardingStatus: "COMPLETED",
      },
      after: {
        name: "Patricia",
        email: "pat@ex.com",
        accountType: "RRSP",
        riskProfile: "AGGRESSIVE",
        onboardingStatus: "COMPLETED",
      },
    });

    expect(result.enqueued).toBe(2);
    const payloads = add.mock.calls.map((c) => c[1]);
    expect(payloads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          trigger: "EVENT_RISK_TIER_CHANGE",
          agentType: "COMPLIANCE",
        }),
        expect.objectContaining({
          trigger: "EVENT_PROFILE_MATERIAL_CHANGE",
          agentType: "COMPLIANCE",
        }),
      ])
    );
    // Never routes via ONBOARDING when onboarding is COMPLETED for profile change.
    expect(payloads.every((p) => p.agentType === "COMPLIANCE")).toBe(true);
  });

  it("routes open-onboarding material change to ONBOARDING only", async () => {
    const { enqueuePkycProfileChangeEvents } = await import(
      "@/lib/queue/pkycTriggers"
    );

    await enqueuePkycProfileChangeEvents({
      clientId: "CLT-011",
      before: {
        name: "Sam",
        email: "sam@ex.com",
        onboardingStatus: "IN_PROGRESS",
      },
      after: {
        name: "Sam",
        email: "samuel@ex.com",
        onboardingStatus: "IN_PROGRESS",
      },
    });

    expect(add).toHaveBeenCalledTimes(1);
    expect(add.mock.calls[0]?.[1]).toMatchObject({
      trigger: "EVENT_PROFILE_MATERIAL_CHANGE",
      agentType: "ONBOARDING",
      eventKey: "email",
    });
  });
});

describe("enqueueSanctionsPepStub", () => {
  const add = vi.fn().mockResolvedValue({ id: "job-1" });
  const getJob = vi.fn().mockResolvedValue(null);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.doMock("@/lib/config", () => ({
      env: { DEMO_DATE: "2026-09-16T12:00:00.000Z", DRY_RUN: true },
    }));
    vi.doMock("@/lib/queue/client", () => ({
      queues: { priority: { add, getJob } },
      connection: {},
    }));
    vi.doMock("@/lib/db/client", () => ({ prisma: {} }));
  });

  it("enqueues Compliance stub only (no vendor call)", async () => {
    const { enqueueSanctionsPepStub } = await import("@/lib/queue/pkycTriggers");
    const result = await enqueueSanctionsPepStub({
      clientId: "CLT-020",
      hitId: "vendor-hit-1",
    });
    expect(result.enqueued).toBe(1);
    expect(add.mock.calls[0]?.[1]).toMatchObject({
      trigger: "EVENT_SANCTIONS_PEP",
      agentType: "COMPLIANCE",
    });
    expect(add.mock.calls[0]?.[2]?.jobId).toBe(
      "sanctions:CLT-020:vendor-hit-1_2026-09-16_COMPLIANCE"
    );
  });
});
