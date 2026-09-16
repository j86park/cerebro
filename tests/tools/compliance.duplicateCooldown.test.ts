import { describe, expect, it, vi } from "vitest";
import { VaultService } from "@/lib/db/vault-service";
import { buildSendClientReminder } from "@/tools/compliance/sendClientReminder";

vi.mock("@/lib/config", () => ({
  env: {
    DRY_RUN: true,
    DEMO_DATE: "2026-03-14T00:00:00.000Z",
    TOOL_POLICY_VERSION: "tool-policy-v1",
  },
}));

vi.mock("@/lib/email/resend", () => ({
  sendTransactionalEmail: vi.fn(),
}));

describe("Duplicate Cooldown Rules", () => {
  it("throws when a duplicate action is attempted within the cooldown period", async () => {
    const vault = new VaultService({ clientId: "CLT-123" }, {} as never);

    // Stage 2 (after advisor alert) so policy allows sendClientReminder
    vault.getActionHistory = vi
      .fn()
      .mockResolvedValue([{ actionType: "NOTIFY_ADVISOR" }]);
    vault.logAction = vi.fn().mockResolvedValue({ id: "x", duplicate: false });
    vault.checkActionCooldown = vi
      .fn()
      .mockRejectedValue(new Error("cooldown error"));

    const tool = buildSendClientReminder(vault);

    await expect(
      (
        tool as unknown as {
          execute: (input: {
            documentId: string;
            subject: string;
            body: string;
            reasoning: string;
          }) => Promise<unknown>;
        }
      ).execute({
        documentId: "doc-1",
        subject: "Test",
        body: "Test",
        reasoning: "This reasoning is twenty characters long.",
      }),
    ).rejects.toThrow(/cooldown/);
  });
});
