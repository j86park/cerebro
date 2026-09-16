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

    vault.getClientProfile = vi.fn().mockResolvedValue({
      onboardingStage: 1,
      onboardingStatus: "IN_PROGRESS",
      accountType: "RRSP",
      riskProfile: "MODERATE",
    });

    vault.getDocuments = vi.fn().mockResolvedValue([
      {
        type: "GOVERNMENT_ID",
        status: "VALID",
        uploadedAt: "2026-01-01T00:00:00.000Z",
      },
      { type: "PROOF_OF_ADDRESS", status: "REQUESTED" },
    ]);

    vault.checkActionCooldown = vi.fn().mockResolvedValue(undefined);
    vault.logAction = vi.fn().mockResolvedValue({ id: "x", duplicate: false });
    vault.upsertOnboardingStageState = vi.fn().mockResolvedValue({});

    const tool = buildAdvanceOnboardingStage(vault);

    await expect(
      (
        tool as unknown as {
          execute: (input: { reasoning: string }) => Promise<unknown>;
        }
      ).execute({ reasoning: "Client provided ID, ready for stage 2" }),
    ).rejects.toThrow(/checklist incomplete|VALID|NOT_VALID|Gaps/i);

    expect(vault.upsertOnboardingStageState).toHaveBeenCalled();
  });

  it("blocks advance when VALID doc is expired vs DEMO_DATE", async () => {
    const vault = new VaultService({ clientId: "CLT-123" }, {} as never);

    vault.getClientProfile = vi.fn().mockResolvedValue({
      onboardingStage: 1,
      onboardingStatus: "IN_PROGRESS",
      accountType: "RRSP",
      riskProfile: "MODERATE",
    });

    vault.getDocuments = vi.fn().mockResolvedValue([
      {
        type: "GOVERNMENT_ID",
        status: "VALID",
        uploadedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        type: "PROOF_OF_ADDRESS",
        status: "VALID",
        uploadedAt: "2025-06-01T00:00:00.000Z",
      },
      {
        type: "SIN_SSN_FORM",
        status: "VALID",
        expiryDate: "2026-03-01T00:00:00.000Z",
        uploadedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);

    vault.checkActionCooldown = vi.fn().mockResolvedValue(undefined);
    vault.logAction = vi.fn().mockResolvedValue({ id: "x", duplicate: false });
    vault.upsertOnboardingStageState = vi.fn().mockResolvedValue({});

    const tool = buildAdvanceOnboardingStage(vault);

    await expect(
      (
        tool as unknown as {
          execute: (input: { reasoning: string }) => Promise<unknown>;
        }
      ).execute({
        reasoning: "All docs look valid but SIN expired vs demo date",
      }),
    ).rejects.toThrow(/EXPIRED|checklist incomplete/i);
  });

  it("advances when checklist is complete under DEMO_DATE rules", async () => {
    const vault = new VaultService({ clientId: "CLT-123" }, {} as never);

    vault.getClientProfile = vi.fn().mockResolvedValue({
      onboardingStage: 1,
      onboardingStatus: "IN_PROGRESS",
      accountType: "RRSP",
      riskProfile: "MODERATE",
    });

    vault.getDocuments = vi.fn().mockResolvedValue([
      {
        type: "GOVERNMENT_ID",
        status: "VALID",
        uploadedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        type: "PROOF_OF_ADDRESS",
        status: "VALID",
        uploadedAt: "2025-06-01T00:00:00.000Z",
      },
      {
        type: "SIN_SSN_FORM",
        status: "VALID",
        uploadedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);

    vault.checkActionCooldown = vi.fn().mockResolvedValue(undefined);
    vault.logAction = vi.fn().mockResolvedValue({ id: "x", duplicate: false });
    vault.upsertOnboardingStageState = vi.fn().mockResolvedValue({});

    const tool = buildAdvanceOnboardingStage(vault);
    const result = await (
      tool as unknown as {
        execute: (input: { reasoning: string }) => Promise<{
          success: boolean;
          previousStage: number;
          newStage: number;
        }>;
      }
    ).execute({
      reasoning: "All stage-1 identity documents validated against DEMO_DATE",
    });

    expect(result.success).toBe(true);
    expect(result.previousStage).toBe(1);
    expect(result.newStage).toBe(2);
    expect(vault.upsertOnboardingStageState).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 2, status: "IN_PROGRESS" }),
    );
  });
});
