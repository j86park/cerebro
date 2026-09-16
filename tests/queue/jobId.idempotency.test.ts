import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/config", () => ({
  env: {
    DEMO_DATE: "2026-09-16T12:00:00.000Z",
    REDIS_URL: "redis://localhost:6379",
    NODE_ENV: "test",
    DRY_RUN: true,
  },
}));

describe("buildAgentJobId", () => {
  it("builds scan jobIds from clientId + DEMO_DATE + agentType", async () => {
    const { buildAgentJobId } = await import("@/lib/queue/jobs");
    expect(
      buildAgentJobId({
        clientId: "CLT-001",
        agentType: "COMPLIANCE",
        trigger: "SCHEDULED",
      })
    ).toBe("scan:CLT-001:2026-09-16_COMPLIANCE");
  });

  it("builds upload jobIds from clientId + documentId + agentType", async () => {
    const { buildAgentJobId } = await import("@/lib/queue/jobs");
    expect(
      buildAgentJobId({
        clientId: "CLT-001",
        agentType: "ONBOARDING",
        trigger: "EVENT_UPLOAD",
        documentId: "doc-42",
      })
    ).toBe("upload:CLT-001:doc-42_ONBOARDING");
  });

  it("builds manual jobIds from clientId + DEMO_DATE + agentType", async () => {
    const { buildAgentJobId } = await import("@/lib/queue/jobs");
    expect(
      buildAgentJobId({
        clientId: "CLT-002",
        agentType: "COMPLIANCE",
        trigger: "MANUAL",
      })
    ).toBe("manual:CLT-002:2026-09-16_COMPLIANCE");
  });

  it("emits BullMQ-legal 3-segment jobIds for every trigger", async () => {
    const { buildAgentJobId, assertBullMqCompatibleJobId } = await import(
      "@/lib/queue/jobs"
    );
    const samples = [
      buildAgentJobId({
        clientId: "CLT-001",
        agentType: "COMPLIANCE",
        trigger: "SCHEDULED",
      }),
      buildAgentJobId({
        clientId: "CLT-001",
        agentType: "ONBOARDING",
        trigger: "EVENT_UPLOAD",
        documentId: "doc-42",
      }),
      buildAgentJobId({
        clientId: "CLT-002",
        agentType: "COMPLIANCE",
        trigger: "MANUAL",
      }),
      buildAgentJobId({
        clientId: "CLT-001",
        agentType: "COMPLIANCE",
        trigger: "EVENT_EXPIRY_PROXIMITY",
        documentId: "doc-9",
      }),
      buildAgentJobId({
        clientId: "CLT-001",
        agentType: "COMPLIANCE",
        trigger: "EVENT_RISK_TIER_CHANGE",
        eventKey: "MODERATE-to-AGGRESSIVE",
      }),
      buildAgentJobId({
        clientId: "CLT-002",
        agentType: "ONBOARDING",
        trigger: "EVENT_PROFILE_MATERIAL_CHANGE",
        eventKey: "email-name",
      }),
      buildAgentJobId({
        clientId: "CLT-003",
        agentType: "COMPLIANCE",
        trigger: "EVENT_SANCTIONS_PEP",
        eventKey: "hit_abc",
      }),
    ];
    for (const jobId of samples) {
      expect(jobId.split(":")).toHaveLength(3);
      expect(assertBullMqCompatibleJobId(jobId)).toBe(jobId);
    }
  });

  it("rejects EVENT_UPLOAD without documentId", async () => {
    const { agentJobSchema } = await import("@/lib/queue/jobs");
    const result = agentJobSchema.safeParse({
      clientId: "CLT-001",
      agentType: "ONBOARDING",
      trigger: "EVENT_UPLOAD",
    });
    expect(result.success).toBe(false);
  });
});

describe("agentJobRetentionOptions", () => {
  it("keeps age-based completed retention (not immediate remove)", async () => {
    const { agentJobRetentionOptions } = await import("@/lib/queue/jobs");
    expect(agentJobRetentionOptions.removeOnComplete.age).toBeGreaterThan(0);
    expect(agentJobRetentionOptions.removeOnFail.age).toBeGreaterThan(0);
  });

  it("wires age-based retention into queue defaultJobOptions", async () => {
    vi.resetModules();
    vi.doMock("bullmq", () => {
      return {
        Queue: class {
          name: string;
          opts: { defaultJobOptions?: Record<string, unknown> };
          constructor(
            name: string,
            opts: { defaultJobOptions?: Record<string, unknown> }
          ) {
            this.name = name;
            this.opts = opts;
          }
        },
      };
    });
    vi.doMock("ioredis", () => ({
      default: class RedisMock {
        on = vi.fn();
      },
    }));

    const { queues } = await import("@/lib/queue/client");
    const { agentJobRetentionOptions } = await import("@/lib/queue/jobs");
    const opts = (
      queues.priority as unknown as {
        opts: { defaultJobOptions: Record<string, unknown> };
      }
    ).opts.defaultJobOptions;

    expect(opts.removeOnComplete).toEqual(
      agentJobRetentionOptions.removeOnComplete
    );
    expect(opts.removeOnFail).toEqual(agentJobRetentionOptions.removeOnFail);
  });
});

describe("enqueueAgentJob idempotency", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("passes deterministic jobId and skips add when job already exists", async () => {
    const jobId = "scan:CLT-001:2026-09-16_COMPLIANCE";
    const add = vi.fn().mockResolvedValue({ id: jobId });
    const getJob = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: jobId });

    const { enqueueAgentJob } = await import("@/lib/queue/enqueue");
    const queue = { add, getJob } as never;
    const payload = {
      clientId: "CLT-001",
      agentType: "COMPLIANCE" as const,
      trigger: "SCHEDULED" as const,
    };

    const first = await enqueueAgentJob(queue, payload);
    const second = await enqueueAgentJob(queue, payload);

    expect(first).toEqual({ jobId, deduplicated: false });
    expect(second).toEqual({ jobId, deduplicated: true });
    expect(add).toHaveBeenCalledTimes(1);
    expect(add.mock.calls[0][2]).toMatchObject({ jobId });
  });

  it("treats thrown already-exists errors as deduplicated", async () => {
    const add = vi
      .fn()
      .mockRejectedValue(
        new Error("Job scan:CLT-001:2026-09-16_COMPLIANCE already exists"),
      );
    const getJob = vi.fn().mockResolvedValue(null);

    const { enqueueAgentJob } = await import("@/lib/queue/enqueue");
    const result = await enqueueAgentJob(
      { add, getJob } as never,
      {
        clientId: "CLT-001",
        agentType: "COMPLIANCE",
        trigger: "SCHEDULED",
      }
    );

    expect(result).toEqual({
      jobId: "scan:CLT-001:2026-09-16_COMPLIANCE",
      deduplicated: true,
    });
  });
});

describe("processAgentJob processor idempotency", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("skips agent.generate when a completion marker already exists", async () => {
    const generate = vi.fn();
    const logAction = vi.fn().mockResolvedValue({});
    const hasCompletedAgentJob = vi.fn().mockResolvedValue(true);
    const emitAgentRunComplete = vi.fn().mockResolvedValue(undefined);

    vi.doMock("@/agents/mastra", () => ({
      getCerebro: vi.fn().mockResolvedValue({
        getAgent: () => ({ generate }),
      }),
    }));
    vi.doMock("@/lib/db/vault-service", () => ({
      VaultService: class {
        hasCompletedAgentJob = hasCompletedAgentJob;
        logAction = logAction;
      },
    }));
    vi.doMock("@/tools/compliance", () => ({
      buildComplianceTools: vi.fn(() => ({})),
    }));
    vi.doMock("@/tools/onboarding", () => ({
      buildOnboardingTools: vi.fn(() => ({})),
    }));
    vi.doMock("@/tools/shared", () => ({
      buildSharedTools: vi.fn(() => ({})),
    }));
    vi.doMock("@/lib/events/emit", () => ({
      emitAgentRunComplete,
    }));
    vi.doMock("@/lib/queue/client", () => ({
      connection: { on: vi.fn() },
    }));
    vi.doMock("@/workers/mutation-analysis.worker", () => ({}));
    vi.doMock("@/workers/shadow-runner.worker", () => ({}));
    vi.doMock("@/workers/online-judge.worker", () => ({}));
    vi.doMock("@/lib/evals/enqueue-online-judge", () => ({
      maybeEnqueueOnlineJudgeSample: vi.fn().mockResolvedValue({
        enqueued: false,
        reason: "rate_miss",
      }),
    }));

    const { processAgentJob } = await import("@/lib/queue/workers");
    const { AGENT_JOB_SKIPPED_OUTCOME } = await import("@/lib/queue/jobs");

    const result = await processAgentJob({
      id: "scan:CLT-001:2026-09-16_COMPLIANCE",
      data: {
        clientId: "CLT-001",
        agentType: "COMPLIANCE",
        trigger: "SCHEDULED",
      },
    } as never);

    expect(result).toEqual({ success: true, skipped: true });
    expect(generate).not.toHaveBeenCalled();
    expect(logAction).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: AGENT_JOB_SKIPPED_OUTCOME })
    );
    expect(emitAgentRunComplete).toHaveBeenCalled();
  });

  it("runs agent once when no completion marker exists", async () => {
    const generate = vi.fn().mockResolvedValue({ text: "ok" });
    const logAction = vi.fn().mockResolvedValue({});
    const logDecision = vi.fn().mockResolvedValue({ id: "dec-1" });
    const hasCompletedAgentJob = vi.fn().mockResolvedValue(false);
    const getOnboardingStageState = vi.fn().mockResolvedValue({ stage: 1 });
    const getDocumentContentForAgent = vi.fn().mockResolvedValue({
      documentId: "doc-1",
      type: "ID",
      text: "safe",
      strippedPatterns: [],
      agentContextBlock: "<<<UNTRUSTED_DOCUMENT doc-1>>>\nsafe\n<<<END>>>",
    });

    vi.doMock("@/agents/mastra", () => ({
      getCerebro: vi.fn().mockResolvedValue({
        getAgent: () => ({ generate }),
      }),
    }));
    vi.doMock("@/lib/db/vault-service", () => ({
      VaultService: class {
        hasCompletedAgentJob = hasCompletedAgentJob;
        logAction = logAction;
        logDecision = logDecision;
        getOnboardingStageState = getOnboardingStageState;
        getDocumentContentForAgent = getDocumentContentForAgent;
      },
    }));
    vi.doMock("@/lib/policy/toolAllowlists", () => ({
      assertAgentToolAllowlist: vi.fn(),
    }));
    vi.doMock("@/lib/observability/mastra-tracing", () => ({
      buildJobTracingContext: vi.fn(() => ({
        requestContext: {},
        tracingOptions: {},
        traceId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        contentCaptured: false,
      })),
    }));
    vi.doMock("@/tools/compliance", () => ({
      buildComplianceTools: vi.fn(() => ({})),
    }));
    vi.doMock("@/tools/onboarding", () => ({
      buildOnboardingTools: vi.fn(() => ({})),
    }));
    vi.doMock("@/tools/shared", () => ({
      buildSharedTools: vi.fn(() => ({})),
    }));
    vi.doMock("@/lib/events/emit", () => ({
      emitAgentRunComplete: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("@/lib/queue/client", () => ({
      connection: { on: vi.fn() },
    }));
    vi.doMock("@/lib/queue/clientMemory", () => ({
      buildClientMemoryScope: vi.fn(() => ({
        resource: "CLT-001",
        thread: "CLT-001",
      })),
    }));
    vi.doMock("@/workers/mutation-analysis.worker", () => ({}));
    vi.doMock("@/workers/shadow-runner.worker", () => ({}));
    vi.doMock("@/workers/online-judge.worker", () => ({}));
    vi.doMock("@/lib/evals/enqueue-online-judge", () => ({
      maybeEnqueueOnlineJudgeSample: vi.fn().mockResolvedValue({
        enqueued: false,
        reason: "rate_miss",
      }),
    }));

    const { processAgentJob } = await import("@/lib/queue/workers");
    const { AGENT_JOB_COMPLETED_OUTCOME } = await import("@/lib/queue/jobs");

    const result = await processAgentJob({
      id: "upload:CLT-001:doc-1_ONBOARDING",
      data: {
        clientId: "CLT-001",
        agentType: "ONBOARDING",
        trigger: "EVENT_UPLOAD",
        documentId: "doc-1",
      },
    } as never);

    expect(result).toEqual({
      success: true,
      text: "ok",
      traceId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(logAction).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: AGENT_JOB_COMPLETED_OUTCOME })
    );
  });
});
