import { describe, expect, it, vi } from "vitest";
import { VaultService } from "@/lib/db/vault-service";

describe("VaultService logAction", () => {
  it("writes client-scoped action with required fields", async () => {
    const createAction = vi.fn(async () => ({}));
    const db = {
      client: {
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
        create: createAction,
        deleteMany: vi.fn(async () => ({})),
      },
    };

    const now = new Date("2026-03-14T00:00:00.000Z");
    const vault = new VaultService({ clientId: "CLT-001" }, db);
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
        }),
      }),
    );
  });

  it("rejects empty reasoning", async () => {
    const db = {
      client: {
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
        create: vi.fn(async () => ({})),
        deleteMany: vi.fn(async () => ({})),
      },
    };
    const vault = new VaultService({ clientId: "CLT-001" }, db);
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
});
