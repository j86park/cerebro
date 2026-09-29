import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VaultService } from "@/lib/db/vault-service";
import { ensureDueStageFiveApproval, ensureExpiredDocumentStageOneAlert } from "@/lib/queue/complianceOutcomeGate";

const sendEmail = vi.fn().mockResolvedValue({ id: "dry-run", skipped: true });

vi.mock("@/lib/config", () => ({
  env: {
    DRY_RUN: true,
    DEMO_DATE: "2026-09-28T12:00:00.000Z",
    TOOL_POLICY_VERSION: "tool-policy-v1",
  },
}));
vi.mock("@/lib/email/resend", () => ({
  sendTransactionalEmail: (...args: unknown[]) => sendEmail(...args),
}));

function vaultFixture(options: {
  status?: string;
  history?: Array<{ actionType: string; outcome?: string }>;
} = {}) {
  const logAction = vi.fn().mockResolvedValue({ id: "alert-1" });
  const vault = {
    getNow: () => new Date("2026-09-28T12:00:00.000Z"),
    getClientId: () => "CLT-GATE",
    getDocuments: vi.fn().mockResolvedValue([
      { id: "DOC-1", type: "GOVERNMENT_ID", status: options.status ?? "EXPIRED" },
    ]),
    getActionHistory: vi.fn().mockResolvedValue(options.history ?? []),
    getClientProfile: vi.fn().mockResolvedValue({ advisor: { email: "advisor@example.com" } }),
    checkActionCooldown: vi.fn().mockResolvedValue(undefined),
    logAction,
  } as unknown as VaultService;
  return { vault, logAction };
}

describe("expired-document compliance outcome gate", () => {
  beforeEach(() => sendEmail.mockClear());

  it("sends and audits the policy-gated Stage 1 alert when the model did not", async () => {
    const { vault, logAction } = vaultFixture();
    expect(await ensureExpiredDocumentStageOneAlert(vault)).toEqual({
      applied: true,
      documentId: "DOC-1",
    });
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "advisor@example.com" }));
    expect(logAction).toHaveBeenCalledWith(expect.objectContaining({
      agentType: "COMPLIANCE",
      actionType: "NOTIFY_ADVISOR",
      stage: 1,
      outcome: "DRY_RUN",
    }));
  });

  it("does not alert for valid documents or repeat a successful escalation", async () => {
    const valid = vaultFixture({ status: "VALID" });
    expect(await ensureExpiredDocumentStageOneAlert(valid.vault)).toEqual({
      applied: false,
      reason: "NO_EXPIRED_DOCUMENT",
    });
    const alreadyAlerted = vaultFixture({
      history: [{ actionType: "NOTIFY_ADVISOR", outcome: "EMAIL_SENT" }],
    });
    expect(await ensureExpiredDocumentStageOneAlert(alreadyAlerted.vault)).toEqual({
      applied: false,
      reason: "ESCALATION_ALREADY_STARTED",
    });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("does not treat a blocked alert attempt as a completed ladder stage", async () => {
    const { vault } = vaultFixture({
      history: [{ actionType: "NOTIFY_ADVISOR", outcome: "POLICY_BLOCKED" }],
    });
    expect(await ensureExpiredDocumentStageOneAlert(vault)).toMatchObject({ applied: true });
  });

  it("does not request Stage 5 approval without a completed advisor-approved Stage 4", async () => {
    const { vault } = vaultFixture();
    vault.getActionHistory = vi.fn().mockResolvedValue([
      { actionType: "NOTIFY_ADVISOR", stage: 1, outcome: "DRY_RUN",
        effectiveAt: new Date("2026-08-01T00:00:00.000Z"), performedAt: new Date() },
      { actionType: "SEND_CLIENT_REMINDER", stage: 2, outcome: "DRY_RUN" },
      { actionType: "SEND_CLIENT_REMINDER", stage: 3, outcome: "DRY_RUN" },
      { actionType: "ESCALATE_COMPLIANCE", stage: 4, outcome: "HITL_SUSPENDED" },
    ]);
    expect(await ensureDueStageFiveApproval(vault)).toEqual({ applied: false });
  });
});
