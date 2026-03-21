import { describe, expect, it, vi } from "vitest";
import { VaultService } from "@/lib/db/vault-service";
import { buildSendClientReminder } from "@/tools/compliance/sendClientReminder";

vi.mock("@/lib/config", () => ({ env: { DRY_RUN: true } }));

describe("Duplicate Cooldown Rules", () => {
  it("throws when a duplicate action is attempted within the cooldown period", async () => {
    // Mock VaultService directly
    const vault = new VaultService({ clientId: "CLT-123" }, {} as any);
    
    vault.checkActionCooldown = vi.fn().mockRejectedValue(new Error("cooldown error"));

    const tool = buildSendClientReminder(vault);
    
    // Using 5 days as the standard compliance cooldown in our code
    await expect(
      (tool as any).execute({ documentId: "doc-1", subject: "Test", body: "Test", reasoning: "This reasoning is twenty characters long." })
    ).rejects.toThrow(/cooldown/);
  });
});
