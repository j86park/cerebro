import { describe, expect, it, vi } from "vitest";
import { VaultService } from "@/lib/db/vault-service";
import { buildSendAdvisorAlert } from "@/tools/shared/sendAdvisorAlert";
import { buildMarkResolved } from "@/tools/compliance/markResolved";
import { buildGetClientProfile } from "@/tools/shared/getClientProfile";

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

function stubVault(): VaultService {
  return new VaultService({ clientId: "CLT-123" }, {} as never);
}

describe("sendAdvisorAlert cooldown + agentType", () => {
  it("enforces 5-day NOTIFY_ADVISOR cooldown", async () => {
    const vault = stubVault();
    vault.getActionHistory = vi.fn().mockResolvedValue([]);
    vault.checkActionCooldown = vi
      .fn()
      .mockRejectedValue(new Error("Action NOTIFY_ADVISOR is within cooldown"));
    vault.getClientProfile = vi.fn().mockResolvedValue({
      advisor: { email: "a@example.com" },
    });
    vault.logAction = vi.fn();

    const tool = buildSendAdvisorAlert(vault, { agentType: "COMPLIANCE" });
    await expect(
      (
        tool as unknown as {
          execute: (i: {
            subject: string;
            body: string;
            reasoning: string;
          }) => Promise<unknown>;
        }
      ).execute({
        subject: "Alert",
        body: "Body",
        reasoning: "This reasoning is twenty characters long.",
      }),
    ).rejects.toThrow(/cooldown/);

    expect(vault.checkActionCooldown).toHaveBeenCalledWith("NOTIFY_ADVISOR", 5);
  });

  it("logs ONBOARDING agentType when built for onboarding", async () => {
    const vault = stubVault();
    vault.getActionHistory = vi.fn().mockResolvedValue([]);
    vault.checkActionCooldown = vi.fn().mockResolvedValue(undefined);
    vault.getClientProfile = vi.fn().mockResolvedValue({
      advisor: { email: "a@example.com" },
    });
    vault.logAction = vi.fn().mockResolvedValue({ id: "a1" });

    const tool = buildSendAdvisorAlert(vault, { agentType: "ONBOARDING" });
    const result = await (
      tool as unknown as {
        execute: (i: {
          subject: string;
          body: string;
          reasoning: string;
        }) => Promise<{ agentType: string; dryRun: boolean }>;
      }
    ).execute({
      subject: "Stuck",
      body: "Please follow up",
      reasoning: "Client has not responded for over seven days now.",
    });

    expect(result.agentType).toBe("ONBOARDING");
    expect(result.dryRun).toBe(true);
    expect(vault.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        agentType: "ONBOARDING",
        actionType: "NOTIFY_ADVISOR",
        outcome: "DRY_RUN",
      }),
    );
  });
});

describe("markResolved", () => {
  it("sets VALID and logs MARK_RESOLVED", async () => {
    const vault = stubVault();
    vault.checkActionCooldown = vi.fn().mockResolvedValue(undefined);
    vault.updateDocumentStatus = vi.fn().mockResolvedValue({});
    vault.logAction = vi.fn().mockResolvedValue({ id: "a1" });

    const tool = buildMarkResolved(vault);
    const result = await (
      tool as unknown as {
        execute: (i: {
          documentId: string;
          reasoning: string;
        }) => Promise<{ newStatus: string; success: boolean }>;
      }
    ).execute({
      documentId: "doc-1",
      reasoning: "Client uploaded a fresh ID that clears the expiry issue.",
    });

    expect(result).toEqual({
      success: true,
      documentId: "doc-1",
      newStatus: "VALID",
    });
    expect(vault.updateDocumentStatus).toHaveBeenCalledWith(
      "doc-1",
      "VALID",
      undefined,
    );
    expect(vault.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "MARK_RESOLVED",
        outcome: "STATUS_UPDATED_TO_VALID",
      }),
    );
  });

  it("respects MARK_RESOLVED cooldown", async () => {
    const vault = stubVault();
    vault.checkActionCooldown = vi
      .fn()
      .mockRejectedValue(new Error("cooldown"));
    vault.updateDocumentStatus = vi.fn();

    const tool = buildMarkResolved(vault);
    await expect(
      (
        tool as unknown as {
          execute: (i: {
            documentId: string;
            reasoning: string;
          }) => Promise<unknown>;
        }
      ).execute({
        documentId: "doc-1",
        reasoning: "Client uploaded a fresh ID that clears the expiry issue.",
      }),
    ).rejects.toThrow(/cooldown/);
    expect(vault.updateDocumentStatus).not.toHaveBeenCalled();
  });
});

describe("getClientProfile riskProfile", () => {
  it("returns riskProfile from the vault profile", async () => {
    const vault = stubVault();
    vault.getClientProfile = vi.fn().mockResolvedValue({
      id: "CLT-123",
      name: "Ada",
      email: "ada@example.com",
      accountType: "TFSA",
      riskProfile: "AGGRESSIVE",
      onboardingStatus: "IN_PROGRESS",
      onboardingStage: 2,
      advisor: { name: "Bob", email: "bob@example.com" },
      firm: { name: "Firm" },
    });

    const tool = buildGetClientProfile(vault);
    const result = await (
      tool as unknown as {
        execute: () => Promise<{ riskProfile: string | null; accountType: string }>;
      }
    ).execute();

    expect(result.riskProfile).toBe("AGGRESSIVE");
    expect(result.accountType).toBe("TFSA");
  });

  it("returns null riskProfile when unset", async () => {
    const vault = stubVault();
    vault.getClientProfile = vi.fn().mockResolvedValue({
      id: "CLT-123",
      name: "Ada",
      email: "ada@example.com",
      accountType: "RRSP",
      riskProfile: null,
      onboardingStatus: "IN_PROGRESS",
      onboardingStage: 1,
      advisor: { name: "Bob", email: "bob@example.com" },
      firm: { name: "Firm" },
    });

    const tool = buildGetClientProfile(vault);
    const result = await (
      tool as unknown as {
        execute: () => Promise<{ riskProfile: string | null }>;
      }
    ).execute();

    expect(result.riskProfile).toBeNull();
  });
});
