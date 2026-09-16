import { describe, expect, it, vi } from "vitest";
import { VaultService } from "@/lib/db/vault-service";

function createDbStub(overrides?: {
  createAction?: ReturnType<typeof vi.fn>;
}) {
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
      findFirst: vi.fn(async () => null),
      create:
        overrides?.createAction ??
        vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
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
      findUnique: vi.fn(async () => null),
      upsert: vi.fn(async () => ({})),
    },
  };
}

describe("VaultService logAction", () => {
  it("writes client-scoped action with required fields", async () => {
    const createAction = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "ACT-1",
      ...data,
    }));
    const db = createDbStub({ createAction });

    const now = new Date("2026-03-14T00:00:00.000Z");
    const vault = new VaultService({ clientId: "CLT-001" }, db as never);
    await vault.logAction({
      agentType: "COMPLIANCE",
      actionType: "NOTIFY_ADVISOR",
      trigger: "SCHEDULED",
      reasoning: "KYC expired.",
      nextScheduledAt: now,
    });

    expect(createAction).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientId: "CLT-001",
          reasoning: "KYC expired.",
          nextScheduledAt: now,
          actor: "AGENT",
        }),
      }),
    );
  });

  it("rejects empty reasoning", async () => {
    const db = createDbStub();
    const vault = new VaultService({ clientId: "CLT-001" }, db as never);
    await expect(
      vault.logAction({
        agentType: "COMPLIANCE",
        actionType: "NOTIFY_ADVISOR",
        trigger: "SCHEDULED",
        reasoning: "",
        nextScheduledAt: new Date("2026-03-14T00:00:00.000Z"),
      }),
    ).rejects.toThrow();
  });

  it("persists ledger metadata fields", async () => {
    const createAction = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "ACT-2",
      ...data,
    }));
    const db = createDbStub({ createAction });
    const vault = new VaultService({ clientId: "CLT-001" }, db as never);

    await vault.logAction({
      agentType: "COMPLIANCE",
      actionType: "ESCALATE_COMPLIANCE",
      trigger: "SCHEDULED",
      reasoning: "Unresolved KYC past threshold.",
      stage: 4,
      policyVersion: "policy-v1",
      promptVersionId: undefined,
      actor: "AGENT",
      reasonCodes: ["ESCALATION_THRESHOLD"],
      citedFields: { daysOpen: 21 },
      idempotencyKey: "escalate:compliance:CLT-001-KYC",
    });

    expect(createAction).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          stage: 4,
          policyVersion: "policy-v1",
          reasonCodes: ["ESCALATION_THRESHOLD"],
          idempotencyKey: "escalate:compliance:CLT-001-KYC",
        }),
      }),
    );
  });
});
