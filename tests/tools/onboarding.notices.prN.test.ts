import { describe, expect, it, vi, beforeEach } from "vitest";
import { VaultService } from "@/lib/db/vault-service";
import { buildSendStageProgressNotice } from "@/tools/onboarding/sendStageProgressNotice";
import { buildSendOnboardingCompleteNotice } from "@/tools/onboarding/sendOnboardingCompleteNotice";

const sendTransactionalEmail = vi.fn().mockResolvedValue({
  id: "dry-run",
  skipped: true,
});

vi.mock("@/lib/config", () => ({
  env: {
    DRY_RUN: true,
    DEMO_DATE: "2026-03-14T00:00:00.000Z",
    TOOL_POLICY_VERSION: "tool-policy-v1",
  },
}));

vi.mock("@/lib/email/resend", () => ({
  sendTransactionalEmail: (...args: unknown[]) =>
    sendTransactionalEmail(...args),
}));

describe("onboarding notice tools (PR-N / T1.4–T1.5)", () => {
  beforeEach(() => {
    sendTransactionalEmail.mockClear();
  });

  it("sendStageProgressNotice emails client and logs under DRY_RUN", async () => {
    const vault = new VaultService({ clientId: "CLT-123" }, {} as never);
    vault.getClientProfile = vi.fn().mockResolvedValue({
      email: "client@example.com",
      onboardingStage: 2,
      accountType: "RRSP",
    });
    vault.logAction = vi.fn().mockResolvedValue({ id: "a1" });

    const tool = buildSendStageProgressNotice(vault);
    const result = await (
      tool as unknown as {
        execute: (i: {
          newStage: number;
          message: string;
          reasoning: string;
        }) => Promise<{ dryRun: boolean; newStage: number }>;
      }
    ).execute({
      newStage: 2,
      message: "You have reached stage 2 — identity verified.",
      reasoning:
        "All stage-1 checklist documents are VALID; confirming progress to the client.",
    });

    expect(result.dryRun).toBe(true);
    expect(result.newStage).toBe(2);
    expect(sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "client@example.com",
        subject: "Onboarding progress: Stage 2",
      }),
    );
    expect(vault.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "STAGE_PROGRESS_NOTICE",
        outcome: "DRY_RUN",
      }),
    );
  });

  it("sendOnboardingCompleteNotice emails client and advisor", async () => {
    const vault = new VaultService({ clientId: "CLT-123" }, {} as never);
    vault.getClientProfile = vi.fn().mockResolvedValue({
      id: "CLT-123",
      name: "Ada Lovelace",
      email: "client@example.com",
      onboardingStage: 4,
      accountType: "RRSP",
      advisor: { email: "advisor@example.com" },
    });
    vault.logAction = vi.fn().mockResolvedValue({ id: "a2" });

    const tool = buildSendOnboardingCompleteNotice(vault);
    const result = await (
      tool as unknown as {
        execute: (i: {
          welcomeMessage: string;
          advisorMessage: string;
          reasoning: string;
        }) => Promise<{
          dryRun: boolean;
          clientNotified: boolean;
          advisorNotified: boolean;
        }>;
      }
    ).execute({
      welcomeMessage: "Welcome aboard — your vault onboarding is complete.",
      advisorMessage: "Ada Lovelace completed onboarding successfully.",
      reasoning:
        "Final-stage checklist is fully VALID; closing the loop with client and advisor.",
    });

    expect(result.dryRun).toBe(true);
    expect(result.clientNotified).toBe(true);
    expect(result.advisorNotified).toBe(true);
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(2);
    expect(vault.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "ONBOARDING_COMPLETE_NOTICE",
        outcome: "DRY_RUN",
      }),
    );
  });
});
