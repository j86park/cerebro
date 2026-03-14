import { describe, expect, it, vi } from "vitest";
import { VaultService } from "@/lib/db/vault-service";

describe("VaultService client scoping", () => {
  it("scopes getClientProfile and getDocuments by constructor clientId", async () => {
    const findUniqueOrThrow = vi.fn(async () => ({ id: "CLT-001" }));
    const findManyDocuments = vi.fn(async () => []);
    const findManyActions = vi.fn(async () => []);

    const db = {
      client: {
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
        create: vi.fn(async () => ({})),
        deleteMany: vi.fn(async () => ({})),
      },
    };

    const vault = new VaultService({ clientId: "CLT-001" }, db);
    await vault.getClientProfile();
    await vault.getDocuments();
    await vault.getActionHistory();

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
  });
});
