import { describe, expect, it, vi, beforeEach } from "vitest";
import { VaultService } from "@/lib/db/vault-service";
import { buildSendAdvisorAlert } from "@/tools/shared/sendAdvisorAlert";
import { buildRequestDocument } from "@/tools/onboarding/requestDocument";
import { buildAlertAdvisorStuck } from "@/tools/onboarding/alertAdvisorStuck";
import { buildEscalateToComplianceOfficer } from "@/tools/compliance/escalateToComplianceOfficer";
import { buildEscalateToManagement } from "@/tools/compliance/escalateToManagement";
import { PolicyApprovalRequiredError } from "@/lib/policy";

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

vi.mock("@/lib/hitl/suspend", () => ({
  beginHitlSuspend: vi.fn().mockResolvedValue({
    workflowRunId: "wf-test",
    openKey: "open-test",
  }),
}));

describe("email DRY_RUN parity (PR-C / T0.5)", () => {
  beforeEach(() => {
    sendTransactionalEmail.mockClear();
  });

  it("sendAdvisorAlert always calls sendTransactionalEmail and still logs under DRY_RUN", async () => {
    const vault = new VaultService({ clientId: "CLT-123" }, {} as never);
    vault.getActionHistory = vi.fn().mockResolvedValue([]);
    vault.checkActionCooldown = vi.fn().mockResolvedValue(undefined);
    vault.getClientProfile = vi.fn().mockResolvedValue({
      advisor: { email: "advisor@example.com" },
    });
    vault.logAction = vi.fn().mockResolvedValue({ id: "a1" });

    const tool = buildSendAdvisorAlert(vault);
    await (
      tool as unknown as {
        execute: (i: {
          subject: string;
          body: string;
          reasoning: string;
        }) => Promise<{ dryRun: boolean }>;
      }
    ).execute({
      subject: "Alert",
      body: "Please review",
      reasoning: "KYC is approaching expiry within the advisory window.",
    });

    expect(sendTransactionalEmail).toHaveBeenCalledWith({
      to: "advisor@example.com",
      subject: "Alert",
      text: "Please review",
    });
    expect(vault.logAction).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "DRY_RUN" }),
    );
  });

  it("requestDocument emails the client via sendTransactionalEmail", async () => {
    const vault = new VaultService({ clientId: "CLT-123" }, {} as never);
    vault.getClientProfile = vi.fn().mockResolvedValue({
      email: "client@example.com",
      onboardingStage: 1,
      accountType: "RRSP",
      riskProfile: "MODERATE",
    });
    vault.checkActionCooldown = vi.fn().mockResolvedValue(undefined);
    vault.upsertDocument = vi.fn().mockResolvedValue({});
    vault.logAction = vi.fn().mockResolvedValue({ id: "a1" });

    const tool = buildRequestDocument(vault);
    await (
      tool as unknown as {
        execute: (i: {
          documentType: string;
          message: string;
          reasoning: string;
        }) => Promise<unknown>;
      }
    ).execute({
      documentType: "GOVERNMENT_ID",
      message: "Please upload your government ID.",
      reasoning: "Stage 1 identity checklist still missing government ID.",
    });

    expect(sendTransactionalEmail).toHaveBeenCalledWith({
      to: "client@example.com",
      subject: "Document request: GOVERNMENT_ID",
      text: "Please upload your government ID.",
    });
    expect(vault.logAction).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "DRY_RUN" }),
    );
  });

  it("alertAdvisorStuck emails the advisor via sendTransactionalEmail", async () => {
    const vault = new VaultService({ clientId: "CLT-123" }, {} as never);
    vault.getClientProfile = vi.fn().mockResolvedValue({
      name: "Ada",
      onboardingStage: 2,
      advisor: { email: "advisor@example.com" },
    });
    vault.checkActionCooldown = vi.fn().mockResolvedValue(undefined);
    vault.resetOnboarding = vi.fn().mockResolvedValue({});
    vault.logAction = vi.fn().mockResolvedValue({ id: "a1" });

    const tool = buildAlertAdvisorStuck(vault);
    await (
      tool as unknown as {
        execute: (i: {
          reasoning: string;
          daysSinceLastResponse: number;
        }) => Promise<unknown>;
      }
    ).execute({
      reasoning: "Client has not responded for twelve days at stage two.",
      daysSinceLastResponse: 12,
    });

    expect(sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "advisor@example.com",
        subject: "Onboarding stuck: Ada",
      }),
    );
    expect(vault.logAction).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "DRY_RUN" }),
    );
  });

  it("HITL approve-class escalations do not email on suspend", async () => {
    const vault = new VaultService({ clientId: "CLT-123" }, {} as never);
    vault.checkActionCooldown = vi.fn().mockResolvedValue(undefined);
    vault.getClientProfile = vi.fn().mockResolvedValue({
      name: "Ada",
      advisor: { email: "advisor@example.com" },
    });
    vault.logAction = vi.fn().mockResolvedValue({ id: "a1" });

    // Stage 4 ladder history (two reminders, no compliance escalate yet)
    vault.getActionHistory = vi.fn().mockResolvedValue([
      { actionType: "NOTIFY_ADVISOR" },
      { actionType: "SEND_CLIENT_REMINDER" },
      { actionType: "SEND_CLIENT_REMINDER" },
    ]);

    const officer = buildEscalateToComplianceOfficer(vault);
    const officerResult = await (
      officer as unknown as {
        execute: (i: { reasoning: string }) => Promise<{
          pendingApproval?: boolean;
        }>;
      }
    ).execute({
      reasoning:
        "Two reminders sent; escalating to compliance officer for review.",
    });

    expect(officerResult.pendingApproval).toBe(true);
    expect(sendTransactionalEmail).not.toHaveBeenCalled();

    sendTransactionalEmail.mockClear();

    // Stage 5 ladder history
    vault.getActionHistory = vi.fn().mockResolvedValue([
      { actionType: "NOTIFY_ADVISOR" },
      { actionType: "SEND_CLIENT_REMINDER" },
      { actionType: "SEND_CLIENT_REMINDER" },
      { actionType: "ESCALATE_COMPLIANCE" },
    ]);

    const management = buildEscalateToManagement(vault);
    const mgmtResult = await (
      management as unknown as {
        execute: (i: { reasoning: string }) => Promise<{
          pendingApproval?: boolean;
        }>;
      }
    ).execute({
      reasoning:
        "Compliance officer stage complete; escalating to management now.",
    });
    expect(mgmtResult.pendingApproval).toBe(true);
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("escalate auto path emails when policy returns auto (matrix override seam)", async () => {
    const policy = await import("@/lib/policy");
    const enforceSpy = vi.spyOn(policy, "enforceToolPolicy").mockResolvedValue({
      mode: "auto",
      policyVersion: "tool-policy-v1",
      stage: 4,
    });

    const vault = new VaultService({ clientId: "CLT-123" }, {} as never);
    vault.getActionHistory = vi.fn().mockResolvedValue([
      { actionType: "NOTIFY_ADVISOR" },
      { actionType: "SEND_CLIENT_REMINDER" },
      { actionType: "SEND_CLIENT_REMINDER" },
    ]);
    vault.checkActionCooldown = vi.fn().mockResolvedValue(undefined);
    vault.getClientProfile = vi.fn().mockResolvedValue({
      name: "Ada",
      advisor: { email: "advisor@example.com" },
    });
    vault.logAction = vi.fn().mockResolvedValue({ id: "a1" });

    const officer = buildEscalateToComplianceOfficer(vault);
    await (
      officer as unknown as {
        execute: (i: { reasoning: string }) => Promise<unknown>;
      }
    ).execute({
      reasoning:
        "Two reminders sent; escalating to compliance officer for review.",
    });

    expect(sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "advisor@example.com",
        subject: "Compliance escalation: Ada",
      }),
    );
    expect(vault.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "ESCALATE_COMPLIANCE",
        outcome: "DRY_RUN",
      }),
    );

    enforceSpy.mockRestore();
    // Ensure PolicyApprovalRequiredError still exists for other suites
    expect(PolicyApprovalRequiredError).toBeDefined();
  });
});
