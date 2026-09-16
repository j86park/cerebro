import { describe, expect, it, vi, beforeEach } from "vitest";
import { VaultService } from "@/lib/db/vault-service";
import { EscalationStatus } from "@/lib/db/enums";
import {
  beginHitlSuspend,
  processHitlResumeFromEscalation,
  applyHitlDecision,
  buildHitlOpenKey,
  COMPLIANCE_HITL_WORKFLOW_ID,
  type HitlContext,
} from "@/lib/hitl";

vi.mock("@/lib/config", () => ({
  env: {
    DRY_RUN: true,
    DEMO_DATE: "2026-03-14T00:00:00.000Z",
    TOOL_POLICY_VERSION: "tool-policy-v1",
    HITL_APPROVAL_TIMEOUT_MS: 60_000,
    DATABASE_URL: "postgresql://localhost:5432/cerebro_test",
    REDIS_URL: "redis://localhost:6379",
    NODE_ENV: "test",
  },
}));

function createVaultMock(clientId = "CLT-HITL") {
  const vault = new VaultService({ clientId }, {} as never);
  const escalationStore = new Map<
    string,
    {
      openKey: string | null;
      status: string;
      ladderStage: number;
      hitlContext: HitlContext | null;
      reasonCodes: string[];
      policyVersion?: string;
    }
  >();
  const actions: Array<Record<string, unknown>> = [];
  const documentsMutated: string[] = [];

  vault.upsertEscalationState = vi.fn(async (input) => {
    const row = {
      openKey: input.openKey,
      status: input.status,
      ladderStage: input.ladderStage,
      hitlContext: (input.hitlContext as HitlContext | undefined) ?? null,
      reasonCodes: input.reasonCodes ?? [],
      policyVersion: input.policyVersion,
    };
    escalationStore.set(input.openKey, row);
    return row;
  });

  vault.getEscalationStateByOpenKey = vi.fn(async (openKey: string) => {
    const row = escalationStore.get(openKey);
    if (!row || row.openKey == null) return null;
    return row;
  });

  vault.resolveEscalationState = vi.fn(async (input) => {
    const row = escalationStore.get(input.openKey);
    if (!row) {
      throw new Error(`No open escalation with openKey=${input.openKey}`);
    }
    escalationStore.delete(input.openKey);
    return {
      ...row,
      openKey: null,
      status: input.status,
      reasonCodes: input.reasonCodes,
      hitlContext: null,
    };
  });

  vault.logAction = vi.fn(async (input) => {
    const row = { id: `act-${actions.length + 1}`, ...input, duplicate: false };
    actions.push(row);
    return row;
  });

  vault.updateDocumentStatus = vi.fn(async (documentId: string) => {
    documentsMutated.push(documentId);
    return { id: documentId };
  });

  return { vault, escalationStore, actions, documentsMutated };
}

describe("HITL suspend / resume (DRY_RUN)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("suspends approve-class escalation without sending email and persists durable wait state", async () => {
    const { vault, escalationStore, actions } = createVaultMock();
    const timeouts: Array<Record<string, string>> = [];

    const suspended = await beginHitlSuspend({
      vault,
      clientId: "CLT-HITL",
      toolName: "escalateToComplianceOfficer",
      actionType: "ESCALATE_COMPLIANCE",
      stage: 4,
      reasoning: "Two reminders sent; escalate to compliance officer for review.",
      policyVersion: "tool-policy-v1",
      startWorkflow: async () => ({ workflowRunId: "run-hitl-1" }),
      scheduleTimeout: async (payload) => {
        timeouts.push(payload);
      },
    });

    expect(suspended.status).toBe("suspended");
    expect(suspended.workflowRunId).toBe("run-hitl-1");
    expect(suspended.openKey).toBe(
      buildHitlOpenKey("escalateToComplianceOfficer", 4),
    );

    const row = escalationStore.get(suspended.openKey);
    expect(row?.status).toBe(EscalationStatus.PENDING_APPROVAL);
    expect(row?.hitlContext?.workflowRunId).toBe("run-hitl-1");
    expect(row?.hitlContext?.workflowId).toBe(COMPLIANCE_HITL_WORKFLOW_ID);

    expect(actions.some((a) => a.outcome === "HITL_SUSPENDED")).toBe(true);
    expect(timeouts).toHaveLength(1);
    expect(timeouts[0]?.workflowRunId).toBe("run-hitl-1");
  });

  it("survives worker restart mid-wait: resume still applies approval payload from EscalationState", async () => {
    const { vault, actions } = createVaultMock();

    const suspended = await beginHitlSuspend({
      vault,
      clientId: "CLT-HITL",
      toolName: "escalateToComplianceOfficer",
      actionType: "ESCALATE_COMPLIANCE",
      stage: 4,
      reasoning: "Need compliance officer review after two reminders.",
      policyVersion: "tool-policy-v1",
      startWorkflow: async () => ({ workflowRunId: "run-restart-1" }),
      scheduleTimeout: async () => undefined,
    });

    const resumed = await processHitlResumeFromEscalation({
      vault,
      clientId: "CLT-HITL",
      openKey: suspended.openKey,
      decision: "approve",
      advisorId: "ADV-1",
      resumeWorkflow: async () => {
        throw new Error("simulated missing Mastra snapshot after worker restart");
      },
    });

    expect(resumed.outcome).toBe("DRY_RUN");
    expect(resumed.workflowRunId).toBe("run-restart-1");
    expect(
      actions.some(
        (a) =>
          a.outcome === "DRY_RUN" &&
          Array.isArray(a.reasonCodes) &&
          (a.reasonCodes as string[]).includes("HITL_APPROVED"),
      ),
    ).toBe(true);
    expect(await vault.getEscalationStateByOpenKey(suspended.openKey)).toBeNull();
  });

  it("deny path leaves vault documents unchanged except ledger + escalation resolve", async () => {
    const { vault, actions, documentsMutated } = createVaultMock();

    const suspended = await beginHitlSuspend({
      vault,
      clientId: "CLT-HITL",
      toolName: "escalateToManagement",
      actionType: "ESCALATE_MANAGEMENT",
      stage: 5,
      reasoning: "Management escalation proposed after compliance officer stage.",
      policyVersion: "tool-policy-v1",
      startWorkflow: async () => ({ workflowRunId: "run-deny-1" }),
      scheduleTimeout: async () => undefined,
    });

    const result = await processHitlResumeFromEscalation({
      vault,
      clientId: "CLT-HITL",
      openKey: suspended.openKey,
      decision: "deny",
      advisorId: "ADV-1",
      resumeWorkflow: async () => ({ status: "success" }),
    });

    expect(result.outcome).toBe("HITL_DENIED");
    expect(documentsMutated).toHaveLength(0);
    expect(actions.some((a) => a.outcome === "HITL_DENIED")).toBe(true);
  });

  it("timeout never sends client email and moves to SAFE_HOLD (no auto-approve)", async () => {
    const { vault, escalationStore, actions } = createVaultMock();

    const suspended = await beginHitlSuspend({
      vault,
      clientId: "CLT-HITL",
      toolName: "escalateToComplianceOfficer",
      actionType: "ESCALATE_COMPLIANCE",
      stage: 4,
      reasoning: "Waiting on advisor; timeout must not auto-send.",
      policyVersion: "tool-policy-v1",
      startWorkflow: async () => ({ workflowRunId: "run-timeout-1" }),
      scheduleTimeout: async () => undefined,
    });

    const applied = await applyHitlDecision({
      vault,
      context: suspended.hitlContext,
      decision: "timeout",
    });

    expect(applied.emailSent).toBe(false);
    expect(applied.outcome).toBe("HITL_TIMEOUT_SAFE_HOLD");
    expect(applied.vaultMutated).toBe(false);

    const row = escalationStore.get(suspended.openKey);
    expect(row?.status).toBe(EscalationStatus.SAFE_HOLD);
    expect(row?.reasonCodes).toEqual(
      expect.arrayContaining(["HITL_TIMEOUT", "SAFE_HOLD", "NO_AUTO_APPROVE"]),
    );
    expect(actions.some((a) => a.outcome === "HITL_TIMEOUT_SAFE_HOLD")).toBe(
      true,
    );
  });

  it("queue-style timeout resume via processHitlResumeFromEscalation never auto-approves", async () => {
    const { vault, actions } = createVaultMock();

    const suspended = await beginHitlSuspend({
      vault,
      clientId: "CLT-HITL",
      toolName: "escalateToComplianceOfficer",
      actionType: "ESCALATE_COMPLIANCE",
      stage: 4,
      reasoning: "Queue timeout job must safe-hold.",
      policyVersion: "tool-policy-v1",
      startWorkflow: async () => ({ workflowRunId: "run-job-timeout" }),
      scheduleTimeout: async () => undefined,
    });

    const result = await processHitlResumeFromEscalation({
      vault,
      clientId: "CLT-HITL",
      openKey: suspended.openKey,
      decision: "timeout",
      resumeWorkflow: async () => ({ status: "success" }),
    });

    expect(result.outcome).toBe("HITL_TIMEOUT_SAFE_HOLD");
    expect(actions.some((a) => a.outcome === "HITL_TIMEOUT_SAFE_HOLD")).toBe(
      true,
    );
    expect(actions.some((a) => a.outcome === "ESCALATED")).toBe(false);
  });
});
