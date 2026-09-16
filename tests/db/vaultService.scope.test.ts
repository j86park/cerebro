import { describe, expect, it, vi } from "vitest";
import { VaultService } from "@/lib/db/vault-service";

describe("VaultService client scoping", () => {
  it("scopes getClientProfile and getDocuments by constructor clientId", async () => {
    const findUniqueOrThrow = vi.fn(async () => ({ id: "CLT-001" }));
    const findManyDocuments = vi.fn(async () => []);
    const findManyActions = vi.fn(async () => []);
    const findManyEscalations = vi.fn(async () => []);
    const findOnboardingStage = vi.fn(async () => null);

    const db = {
      client: {
        findUnique: vi.fn(async () => null),
        findUniqueOrThrow,
        update: vi.fn(async () => ({})),
      },
      document: {
        findMany: findManyDocuments,
        update: vi.fn(async () => ({})),
        upsert: vi.fn(async () => ({})),
      },
      agentAction: {
        findMany: findManyActions,
        findFirst: vi.fn(async () => null),
        create: vi.fn(async () => ({})),
        deleteMany: vi.fn(async () => ({})),
      },
      escalationState: {
        findMany: findManyEscalations,
        findFirst: vi.fn(async () => null),
        upsert: vi.fn(async () => ({})),
        update: vi.fn(async () => ({})),
      },
      onboardingStage: {
        findUnique: findOnboardingStage,
        upsert: vi.fn(async () => ({})),
      },
    };

    const vault = new VaultService({ clientId: "CLT-001" }, db as never);
    await vault.getClientProfile();
    await vault.getDocuments();
    await vault.getActionHistory();
    await vault.getEscalationStates({ openOnly: true });
    await vault.getOnboardingStageState();

    expect(findUniqueOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "CLT-001" },
      }),
    );
    expect(findManyDocuments).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { clientId: "CLT-001" },
      }),
    );
    expect(findManyActions).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { clientId: "CLT-001" },
      }),
    );
    expect(findManyEscalations).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ clientId: "CLT-001" }),
      }),
    );
    expect(findOnboardingStage).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { clientId: "CLT-001" },
      }),
    );
  });
});
