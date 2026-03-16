import { describe, expect, it, vi } from "vitest";
import { VaultService } from "@/lib/db/vault-service";
import { buildEscalateToManagement } from "@/tools/compliance/escalateToManagement";

vi.mock("@/lib/config", () => ({ env: { DRY_RUN: true } }));

describe("escalateToManagement prerequisites", () => {
  it("fails if ESCALATE_COMPLIANCE was not completed first", async () => {
    const vault = new VaultService({ clientId: "CLT-123" }, {} as any);
    
    // Mock history without ESCALATE_COMPLIANCE
    vault.getActionHistory = vi.fn().mockResolvedValue([
      { actionType: "SEND_CLIENT_REMINDER" }
    ]);
    
    // Mock checkActionCooldown to allow
    vault.checkActionCooldown = vi.fn().mockResolvedValue(undefined);

    const tool = buildEscalateToManagement(vault);
    
    await expect(
      (tool as any).execute({ reasoning: "Test reasoning that is twenty chars" })
    ).rejects.toThrow(/ESCALATE_COMPLIANCE/);
  });
});
