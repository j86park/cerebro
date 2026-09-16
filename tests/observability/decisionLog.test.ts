import { describe, expect, it, vi } from "vitest";
import { VaultService } from "@/lib/db/vault-service";
import {
  buildJobTraceId,
  buildJobTracingContext,
  shouldCaptureTraceContent,
} from "@/lib/observability/mastra-tracing";
import { logDecisionInputSchema } from "@/lib/observability/decision-log";

function createDbStub(overrides?: {
  createDecision?: ReturnType<typeof vi.fn>;
  findDecisions?: ReturnType<typeof vi.fn>;
}) {
  return {
    client: {
      findUnique: vi.fn(async () => null),
      findUniqueOrThrow: vi.fn(async () => ({ onboardingStage: 2 })),
      update: vi.fn(async () => ({})),
    },
    document: {
      findMany: vi.fn(async () => []),
      update: vi.fn(async () => ({})),
      upsert: vi.fn(async () => ({})),
    },
    agentAction: {
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: "ACT-1",
        ...data,
      })),
      deleteMany: vi.fn(async () => ({})),
    },
    escalationState: {
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => null),
      upsert: vi.fn(async () => ({})),
      update: vi.fn(async () => ({})),
    },
    onboardingStage: {
      findUnique: vi.fn(async () => ({ stage: 2 })),
      upsert: vi.fn(async () => ({})),
    },
    decisionRecord: {
      findMany:
        overrides?.findDecisions ??
        vi.fn(async () => []),
      create:
        overrides?.createDecision ??
        vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          id: "DEC-1",
          ...data,
          decidedAt: new Date("2026-03-14T00:00:00.000Z"),
        })),
    },
  };
}

describe("decision log + Mastra tracing tags (WP-P0.6)", () => {
  it("buildJobTraceId is stable hex for a job (one logical trace)", () => {
    const a = buildJobTraceId("job-42");
    const b = buildJobTraceId("job-42");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{32}$/);
  });

  it("buildJobTracingContext tags client/agent/stage/job and redacts content by default", () => {
    const ctx = buildJobTracingContext({
      clientId: "CLT-001",
      agentName: "complianceAgent",
      stage: 2,
      jobId: "job-42",
    });

    expect(ctx.traceId).toBe(buildJobTraceId("job-42"));
    expect(ctx.requestContext.get("clientId")).toBe("CLT-001");
    expect(ctx.requestContext.get("agentName")).toBe("complianceAgent");
    expect(ctx.requestContext.get("stage")).toBe(2);
    expect(ctx.requestContext.get("jobId")).toBe("job-42");
    expect(ctx.tracingOptions.metadata).toEqual(
      expect.objectContaining({
        clientId: "CLT-001",
        agentName: "complianceAgent",
        stage: 2,
        jobId: "job-42",
      }),
    );
    expect(ctx.tracingOptions.tags).toEqual(
      expect.arrayContaining([
        "client:CLT-001",
        "agent:complianceAgent",
        "stage:2",
        "job:job-42",
      ]),
    );
    // Content capture defaults off → hide input/output on spans
    expect(shouldCaptureTraceContent()).toBe(false);
    expect(ctx.contentCaptured).toBe(false);
    expect(ctx.tracingOptions.hideInput).toBe(true);
    expect(ctx.tracingOptions.hideOutput).toBe(true);
  });

  it("VaultService.logDecision persists examiner SoR fields for a sample run", async () => {
    const createDecision = vi.fn(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: "DEC-1",
        ...data,
        decidedAt: new Date("2026-03-14T00:00:00.000Z"),
      }),
    );
    const findDecisions = vi.fn(async () => [
      {
        id: "DEC-1",
        clientId: "CLT-001",
        jobId: "job-42",
        agentName: "complianceAgent",
        stage: 2,
        traceId: buildJobTraceId("job-42"),
        policyVersion: "policy-v1",
        policyFired: "stage2.sendClientReminder.auto",
        toolProposed: ["sendClientReminder"],
        toolExecuted: ["sendClientReminder"],
        refusalCodes: [],
        reviewer: null,
        outcome: "RUN_SUCCEEDED",
        reason: "Reminder sent within policy",
        promptVersionId: "pv-1",
        contentCaptured: false,
        metadata: { trigger: "SCHEDULED" },
        decidedAt: new Date("2026-03-14T00:00:00.000Z"),
      },
    ]);
    const db = createDbStub({ createDecision, findDecisions });
    const vault = new VaultService({ clientId: "CLT-001" }, db as never);

    const traceId = buildJobTraceId("job-42");
    const written = await vault.logDecision({
      jobId: "job-42",
      agentName: "complianceAgent",
      stage: 2,
      traceId,
      policyVersion: "policy-v1",
      policyFired: "stage2.sendClientReminder.auto",
      toolProposed: ["sendClientReminder"],
      toolExecuted: ["sendClientReminder"],
      outcome: "RUN_SUCCEEDED",
      reason: "Reminder sent within policy",
      promptVersionId: "pv-1",
      contentCaptured: false,
      metadata: { trigger: "SCHEDULED" },
    });

    expect(createDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientId: "CLT-001",
          jobId: "job-42",
          agentName: "complianceAgent",
          stage: 2,
          traceId,
          policyFired: "stage2.sendClientReminder.auto",
          toolProposed: ["sendClientReminder"],
          toolExecuted: ["sendClientReminder"],
          outcome: "RUN_SUCCEEDED",
          contentCaptured: false,
        }),
      }),
    );
    expect(written.id).toBe("DEC-1");

    const history = (await vault.getDecisionHistory({ jobId: "job-42" })) as Array<
      Record<string, unknown>
    >;
    expect(findDecisions).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clientId: "CLT-001",
          jobId: "job-42",
        }),
      }),
    );
    // Sample run reconstructible from Postgres alone (who / what / why / policy / tools).
    expect(history[0]).toEqual(
      expect.objectContaining({
        clientId: "CLT-001",
        jobId: "job-42",
        agentName: "complianceAgent",
        stage: 2,
        traceId,
        policyVersion: "policy-v1",
        policyFired: "stage2.sendClientReminder.auto",
        toolProposed: ["sendClientReminder"],
        toolExecuted: ["sendClientReminder"],
        outcome: "RUN_SUCCEEDED",
        reason: "Reminder sent within policy",
        contentCaptured: false,
      }),
    );
  });

  it("rejects invalid decision payloads before write", () => {
    expect(() =>
      logDecisionInputSchema.parse({
        jobId: "job-1",
        agentName: "complianceAgent",
        traceId: "not-hex!!!",
        outcome: "RUN_SUCCEEDED",
        reason: "x",
      }),
    ).toThrow();
  });

  it("records refusal codes and reviewer on REFUSED / PENDING_REVIEW outcomes", async () => {
    const createDecision = vi.fn(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: "DEC-2",
        ...data,
      }),
    );
    const db = createDbStub({ createDecision });
    const vault = new VaultService({ clientId: "CLT-001" }, db as never);

    await vault.logDecision({
      jobId: "job-99",
      agentName: "complianceAgent",
      stage: 3,
      traceId: buildJobTraceId("job-99"),
      policyFired: "stage3.escalateToManagement.approve",
      toolProposed: ["escalateToManagement"],
      toolExecuted: [],
      refusalCodes: ["REQUIRES_APPROVAL"],
      reviewer: "advisor-42",
      outcome: "PENDING_REVIEW",
      reason: "Escalation requires advisor approval",
    });

    expect(createDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          toolProposed: ["escalateToManagement"],
          toolExecuted: [],
          refusalCodes: ["REQUIRES_APPROVAL"],
          reviewer: "advisor-42",
          outcome: "PENDING_REVIEW",
        }),
      }),
    );
  });
});
