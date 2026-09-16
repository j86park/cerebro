import { describe, expect, it, vi } from "vitest";
import { VaultService } from "@/lib/db/vault-service";
import { EscalationStatus, LedgerActor } from "@/lib/db/enums";
import { buildLogAction } from "@/tools/shared/logAction";

function createMockDb(overrides?: {
  findFirst?: ReturnType<typeof vi.fn>;
  create?: ReturnType<typeof vi.fn>;
}) {
  const create =
    overrides?.create ??
    vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "ACT-NEW",
      ...data,
    }));
  const findFirst = overrides?.findFirst ?? vi.fn(async () => null);

  return {
    client: {
      findUnique: vi.fn(async () => null),
      findUniqueOrThrow: vi.fn(async () => ({})),
      update: vi.fn(async () => ({})),
    },
    document: {
      findMany: vi.fn(async () => []),
      update: vi.fn(async () => ({})),
      upsert: vi.fn(async () => ({})),
    },
    agentAction: {
      findMany: vi.fn(async () => []),
      findFirst,
      create,
      deleteMany: vi.fn(async () => ({})),
    },
    escalationState: {
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => null),
      upsert: vi.fn(async () => ({})),
      update: vi.fn(async () => ({})),
    },
    onboardingStage: {
      findUnique: vi.fn(async () => null),
      upsert: vi.fn(async () => ({})),
    },
  };
}

describe("ActionLedger idempotency", () => {
  it("no-ops duplicate logAction with the same idempotencyKey", async () => {
    const existing = {
      id: "ACT-EXISTING",
      clientId: "CLT-001",
      actionType: "SEND_CLIENT_REMINDER",
      idempotencyKey: "reminder:CLT-001-KYC_FORM:2026-03-14",
      reasoning: "Prior reminder",
    };
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existing);
    const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "ACT-NEW",
      ...data,
    }));
    const db = createMockDb({ findFirst, create });
    const vault = new VaultService({ clientId: "CLT-001" }, db as never);

    const first = await vault.logAction({
      agentType: "COMPLIANCE",
      actionType: "SEND_CLIENT_REMINDER",
      trigger: "SCHEDULED",
      reasoning: "KYC expired — first reminder.",
      stage: 2,
      policyVersion: "policy-v1",
      actor: LedgerActor.AGENT,
      reasonCodes: ["KYC_EXPIRED"],
      citedFields: { documentId: "CLT-001-KYC_FORM", status: "EXPIRED" },
      idempotencyKey: "reminder:CLT-001-KYC_FORM:2026-03-14",
    });
    expect(first.duplicate).toBe(false);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientId: "CLT-001",
          policyVersion: "policy-v1",
          idempotencyKey: "reminder:CLT-001-KYC_FORM:2026-03-14",
          reasonCodes: ["KYC_EXPIRED"],
        }),
      }),
    );

    const second = await vault.logAction({
      agentType: "COMPLIANCE",
      actionType: "SEND_CLIENT_REMINDER",
      trigger: "SCHEDULED",
      reasoning: "Retry must not double-send.",
      idempotencyKey: "reminder:CLT-001-KYC_FORM:2026-03-14",
    });
    expect(second.duplicate).toBe(true);
    expect(second.id).toBe("ACT-EXISTING");
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("treats unique-constraint race as idempotent no-op", async () => {
    const existing = {
      id: "ACT-RACE",
      clientId: "CLT-001",
      idempotencyKey: "escalate:compliance:CLT-001-KYC",
    };
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existing);
    const create = vi.fn(async () => {
      const err = Object.assign(new Error("Unique constraint failed"), {
        code: "P2002",
      });
      throw err;
    });
    const db = createMockDb({ findFirst, create });
    const vault = new VaultService({ clientId: "CLT-001" }, db as never);

    const result = await vault.logAction({
      agentType: "COMPLIANCE",
      actionType: "ESCALATE_COMPLIANCE",
      trigger: "SCHEDULED",
      reasoning: "Concurrent retry after unique violation.",
      idempotencyKey: "escalate:compliance:CLT-001-KYC",
    });

    expect(result.duplicate).toBe(true);
    expect(result.id).toBe("ACT-RACE");
  });

  it("upserts EscalationState uniquely by clientId+openKey", async () => {
    const upsert = vi.fn(async () => ({
      id: "ESC-1",
      clientId: "CLT-001",
      openKey: "doc:CLT-001-KYC_FORM",
      status: EscalationStatus.OPEN,
      ladderStage: 1,
    }));
    const db = createMockDb();
    db.escalationState.upsert = upsert;
    const vault = new VaultService({ clientId: "CLT-001" }, db as never);

    await vault.upsertEscalationState({
      openKey: "doc:CLT-001-KYC_FORM",
      ladderStage: 1,
      status: EscalationStatus.OPEN,
      documentId: "CLT-001-KYC_FORM",
      reasonCodes: ["KYC_EXPIRED"],
      policyVersion: "policy-v1",
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          clientId_openKey: {
            clientId: "CLT-001",
            openKey: "doc:CLT-001-KYC_FORM",
          },
        },
      }),
    );
  });

  it("mirrors OnboardingStage upsert onto Client via VaultService", async () => {
    const stageUpsert = vi.fn(async () => ({
      id: "OBS-CLT-001",
      clientId: "CLT-001",
      stage: 2,
      status: "IN_PROGRESS",
    }));
    const clientUpdate = vi.fn(async () => ({}));
    const db = createMockDb();
    db.onboardingStage.upsert = stageUpsert;
    db.client.update = clientUpdate;
    const vault = new VaultService({ clientId: "CLT-001" }, db as never);

    await vault.upsertOnboardingStageState({
      stage: 2,
      status: "IN_PROGRESS",
      checklistSnapshot: { missing: ["KYC_FORM"] },
    });

    expect(stageUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { clientId: "CLT-001" },
        create: expect.objectContaining({
          clientId: "CLT-001",
          stage: 2,
          status: "IN_PROGRESS",
        }),
      }),
    );
    expect(clientUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "CLT-001" },
        data: { onboardingStage: 2, onboardingStatus: "IN_PROGRESS" },
      }),
    );
  });

  it("logAction tool writes only through VaultService (no prisma bypass)", async () => {
    const logAction = vi.fn(async () => ({
      id: "ACT-TOOL",
      duplicate: false,
    }));
    const vault = {
      logAction,
    } as unknown as VaultService;
    const tool = buildLogAction(vault);

    const result = await (
      tool as unknown as {
        execute: (input: Record<string, unknown>) => Promise<{
          success: boolean;
          actionId: string;
          duplicate: boolean;
        }>;
      }
    ).execute({
      agentType: "COMPLIANCE",
      actionType: "NOTIFY_ADVISOR",
      trigger: "SCHEDULED",
      reasoning:
        "Observed expired KYC; notifying advisor as stage-1 escalation with ledger evidence.",
      nextScheduledAt: "2026-03-20T00:00:00.000Z",
      idempotencyKey: "notify:CLT-001:2026-03-14",
      policyVersion: "policy-v1",
      reasonCodes: ["KYC_EXPIRED"],
    });

    expect(logAction).toHaveBeenCalledTimes(1);
    expect(logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "NOTIFY_ADVISOR",
        idempotencyKey: "notify:CLT-001:2026-03-14",
        policyVersion: "policy-v1",
      }),
    );
    expect(result).toEqual({
      success: true,
      actionId: "ACT-TOOL",
      duplicate: false,
    });
  });
});
