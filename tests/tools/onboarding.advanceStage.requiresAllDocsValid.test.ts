import { describe, expect, it, vi } from "vitest";
import { VaultService } from "@/lib/db/vault-service";
import { buildAdvanceOnboardingStage } from "@/tools/onboarding/advanceOnboardingStage";

vi.mock("@/lib/config", () => ({
  env: {
    DRY_RUN: true,
    DEMO_DATE: "2026-03-14T00:00:00.000Z",
    TOOL_POLICY_VERSION: "tool-policy-v1",
  },
}));

describe("advanceOnboardingStage requirements", () => {
  it("fails if required documents for current stage are not VALID", async () => {
    const vault = new VaultService({ clientId: "CLT-123" }, {} as never);

    // Onboarding stage 1 requires GOVERNMENT_ID, PROOF_OF_ADDRESS, SIN_SSN_FORM
    vault.getClientProfile = vi.fn().mockResolvedValue({ onboardingStage: 1 });

    // Documents exist but are MISSING or REQUESTED, not VALID
    vault.getDocuments = vi.fn().mockResolvedValue([
      { type: "GOVERNMENT_ID", status: "VALID" },
      { type: "PROOF_OF_ADDRESS", status: "REQUESTED" },
    ]);

    vault.checkActionCooldown = vi.fn().mockResolvedValue(undefined);
    vault.logAction = vi.fn().mockResolvedValue({ id: "x", duplicate: false });

    const tool = buildAdvanceOnboardingStage(vault);

    await expect(
      (
        tool as unknown as {
          execute: (input: { reasoning: string }) => Promise<unknown>;
        }
      ).execute({ reasoning: "Client provided ID, ready for stage 2" }),
    ).rejects.toThrow(/VALID/);
  });
});
