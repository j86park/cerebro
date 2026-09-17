import { describe, expect, it, vi } from "vitest";
import { VaultService } from "@/lib/db/vault-service";
import { buildAlertAdvisorStuck } from "@/tools/onboarding/alertAdvisorStuck";

vi.mock("@/lib/config", () => ({
  env: {
    DRY_RUN: true,
    DEMO_DATE: "2026-03-14T00:00:00.000Z",
    TOOL_POLICY_VERSION: "tool-policy-v1",
  },
}));

vi.mock("@/lib/email/resend", () => ({
  sendTransactionalEmail: vi.fn().mockResolvedValue({ id: "dry-run", skipped: true }),
}));

describe("alertAdvisorStuck", () => {
  it("transitions client status to STALLED", async () => {
    const vault = new VaultService({ clientId: "CLT-123" }, {} as never);

    vault.getClientProfile = vi.fn().mockResolvedValue({
      name: "Ada",
      onboardingStage: 2,
      advisor: { email: "advisor@example.com" },
    });
    vault.resetOnboarding = vi.fn().mockResolvedValue({});
    vault.checkActionCooldown = vi.fn().mockResolvedValue(undefined);
    vault.logAction = vi.fn().mockResolvedValue({});

    const tool = buildAlertAdvisorStuck(vault);

    await (
      tool as unknown as {
        execute: (input: {
          reasoning: string;
          daysSinceLastResponse: number;
        }) => Promise<unknown>;
      }
    ).execute({
      reasoning: "Client has been stuck for 12 days now.",
      daysSinceLastResponse: 12,
    });

    expect(vault.resetOnboarding).toHaveBeenCalledWith(2, "STALLED");
    expect(vault.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "ALERT_ADVISOR_STUCK",
        outcome: "DRY_RUN",
        policyVersion: "tool-policy-v1",
      }),
    );
  });
});
