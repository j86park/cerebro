import { describe, expect, it, vi } from "vitest";
import { VaultService } from "@/lib/db/vault-service";
import { buildEscalateToManagement } from "@/tools/compliance/escalateToManagement";
import { PolicyBlockedError } from "@/lib/policy";

vi.mock("@/lib/config", () => ({
  env: {
    DRY_RUN: true,
    DEMO_DATE: "2026-03-14T00:00:00.000Z",
    TOOL_POLICY_VERSION: "tool-policy-v1",
  },
}));

describe("escalateToManagement prerequisites", () => {
  it("is blocked by policy when ESCALATE_COMPLIANCE was not completed (out of stage)", async () => {
    const vault = new VaultService({ clientId: "CLT-123" }, {} as never);

    // History without ESCALATE_COMPLIANCE → ladder stage 3 → management blocked
    vault.getActionHistory = vi.fn().mockResolvedValue([
      { actionType: "SEND_CLIENT_REMINDER" },
    ]);
    vault.logAction = vi.fn().mockResolvedValue({ id: "blocked", duplicate: false });
    vault.checkActionCooldown = vi.fn().mockResolvedValue(undefined);

    const tool = buildEscalateToManagement(vault);

    await expect(
      (
        tool as unknown as {
          execute: (input: { reasoning: string }) => Promise<unknown>;
        }
      ).execute({ reasoning: "Test reasoning that is twenty chars" }),
    ).rejects.toBeInstanceOf(PolicyBlockedError);

    expect(vault.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "POLICY_BLOCKED",
        actionType: "ESCALATE_MANAGEMENT",
      }),
    );
    expect(vault.checkActionCooldown).not.toHaveBeenCalled();
  });
});
