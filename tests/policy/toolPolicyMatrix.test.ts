import { describe, expect, it, vi, beforeEach } from "vitest";
import { VaultService } from "@/lib/db/vault-service";
import {
  evaluateToolPolicy,
  enforceToolPolicy,
  PolicyApprovalRequiredError,
  PolicyBlockedError,
  resolveComplianceLadderStage,
  type ToolPolicyMatrix,
} from "@/lib/policy";
import { buildEscalateToManagement } from "@/tools/compliance/escalateToManagement";
import { buildSendClientReminder } from "@/tools/compliance/sendClientReminder";

const resendSendMock = vi.fn();

vi.mock("@/lib/config", () => ({
  env: {
    DRY_RUN: true,
    DEMO_DATE: "2026-03-14T00:00:00.000Z",
    TOOL_POLICY_VERSION: "tool-policy-v1",
    RESEND_API_KEY: "test-key",
  },
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: resendSendMock };
  },
}));

describe("resolveComplianceLadderStage", () => {
  it("returns stage 1 with empty history", () => {
    expect(resolveComplianceLadderStage([])).toBe(1);
  });

  it("advances through the ladder based on prior actions", () => {
    expect(
      resolveComplianceLadderStage([{ actionType: "NOTIFY_ADVISOR" }]),
    ).toBe(2);
    expect(
      resolveComplianceLadderStage([
        { actionType: "NOTIFY_ADVISOR" },
        { actionType: "SEND_CLIENT_REMINDER" },
      ]),
    ).toBe(3);
    expect(
      resolveComplianceLadderStage([
        { actionType: "SEND_CLIENT_REMINDER" },
        { actionType: "SEND_CLIENT_REMINDER" },
      ]),
    ).toBe(4);
    expect(
      resolveComplianceLadderStage([{ actionType: "ESCALATE_COMPLIANCE" }]),
    ).toBe(5);
  });
});

describe("evaluateToolPolicy deny-wins", () => {
  it("blocks when any matching rule is block even if another is auto", () => {
    const matrix: ToolPolicyMatrix = {
      version: "test-v1",
      rules: [
        {
          domain: "compliance",
          stage: 2,
          toolName: "sendClientReminder",
          mode: "auto",
        },
        {
          domain: "compliance",
          stage: 2,
          toolName: "sendClientReminder",
          mode: "block",
        },
      ],
    };

    const decision = evaluateToolPolicy(
      {
        domain: "compliance",
        stage: 2,
        toolName: "sendClientReminder",
      },
      matrix,
    );

    expect(decision.mode).toBe("block");
    expect(decision.reasonCode).toBe("DENY_WINS");
  });

  it("defaults to block when no rule matches", () => {
    const decision = evaluateToolPolicy({
      domain: "compliance",
      stage: 99,
      toolName: "sendClientReminder",
    });
    expect(decision.mode).toBe("block");
    expect(decision.reasonCode).toBe("NO_MATCHING_RULE");
  });

  it("requires approve for stage-4 compliance escalation", () => {
    const decision = evaluateToolPolicy({
      domain: "compliance",
      stage: 4,
      toolName: "escalateToComplianceOfficer",
    });
    expect(decision.mode).toBe("approve");
  });
});

describe("enforceToolPolicy ledger evidence", () => {
  it("writes POLICY_BLOCKED ledger and throws for out-of-stage escalation", async () => {
    const vault = new VaultService({ clientId: "CLT-POLICY" }, {} as never);
    vault.logAction = vi.fn().mockResolvedValue({ id: "ledger-1", duplicate: false });

    await expect(
      enforceToolPolicy({
        vault,
        domain: "compliance",
        stage: 2,
        toolName: "escalateToManagement",
        agentType: "COMPLIANCE",
        actionType: "ESCALATE_MANAGEMENT",
        reasoning: "Model requested management escalation too early.",
      }),
    ).rejects.toBeInstanceOf(PolicyBlockedError);

    expect(vault.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "ESCALATE_MANAGEMENT",
        outcome: "POLICY_BLOCKED",
        stage: 2,
        policyVersion: "tool-policy-v1",
        reasonCodes: expect.arrayContaining(["POLICY_DENY"]),
      }),
    );
  });

  it("writes PENDING_APPROVAL ledger for approve-class tools", async () => {
    const vault = new VaultService({ clientId: "CLT-POLICY" }, {} as never);
    vault.logAction = vi.fn().mockResolvedValue({ id: "ledger-2", duplicate: false });

    await expect(
      enforceToolPolicy({
        vault,
        domain: "compliance",
        stage: 4,
        toolName: "escalateToComplianceOfficer",
        agentType: "COMPLIANCE",
        actionType: "ESCALATE_COMPLIANCE",
        reasoning: "Two reminders sent; escalate to compliance officer.",
      }),
    ).rejects.toBeInstanceOf(PolicyApprovalRequiredError);

    expect(vault.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "PENDING_APPROVAL",
        policyVersion: "tool-policy-v1",
        reasonCodes: expect.arrayContaining(["POLICY_REQUIRES_APPROVAL"]),
      }),
    );
  });
});

describe("tool wrappers respect policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks out-of-stage escalateToManagement with ledger evidence", async () => {
    const vault = new VaultService({ clientId: "CLT-123" }, {} as never);
    vault.getActionHistory = vi.fn().mockResolvedValue([
      { actionType: "NOTIFY_ADVISOR" },
      { actionType: "SEND_CLIENT_REMINDER" },
    ]);
    vault.logAction = vi.fn().mockResolvedValue({ id: "x", duplicate: false });
    vault.checkActionCooldown = vi.fn();

    const tool = buildEscalateToManagement(vault);

    await expect(
      (
        tool as unknown as {
          execute: (input: { reasoning: string }) => Promise<unknown>;
        }
      ).execute({
        reasoning: "Skipping ladder to escalate to management now.",
      }),
    ).rejects.toThrow(/Policy blocked/);

    expect(vault.checkActionCooldown).not.toHaveBeenCalled();
    expect(vault.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "POLICY_BLOCKED",
        actionType: "ESCALATE_MANAGEMENT",
        policyVersion: "tool-policy-v1",
      }),
    );
  });

  it("dry-run reminder writes DRY_RUN ledger and does not call Resend network", async () => {
    const vault = new VaultService({ clientId: "CLT-123" }, {} as never);
    vault.getActionHistory = vi
      .fn()
      .mockResolvedValue([{ actionType: "NOTIFY_ADVISOR" }]);
    vault.checkActionCooldown = vi.fn().mockResolvedValue(undefined);
    vault.getClientProfile = vi
      .fn()
      .mockResolvedValue({ email: "client@example.com" });
    vault.updateDocumentStatus = vi.fn().mockResolvedValue({});
    vault.logAction = vi.fn().mockResolvedValue({ id: "rem-1", duplicate: false });

    const tool = buildSendClientReminder(vault);
    const result = await (
      tool as unknown as {
        execute: (input: {
          documentId: string;
          subject: string;
          body: string;
          reasoning: string;
        }) => Promise<{
          success: boolean;
          dryRun: boolean;
          policyVersion: string;
        }>;
      }
    ).execute({
      documentId: "doc-1",
      subject: "Reminder",
      body: "Please upload your KYC.",
      reasoning: "Stage 2 reminder after advisor alert with no response.",
    });

    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.policyVersion).toBe("tool-policy-v1");
    expect(resendSendMock).not.toHaveBeenCalled();
    expect(vault.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "SEND_CLIENT_REMINDER",
        outcome: "DRY_RUN",
        policyVersion: "tool-policy-v1",
        stage: 2,
      }),
    );
  });
});
