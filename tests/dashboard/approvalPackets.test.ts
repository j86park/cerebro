import { describe, expect, it, vi } from "vitest";
import { VaultService } from "@/lib/db/vault-service";
import { EscalationStatus } from "@/lib/db/enums";
import { buildApprovalPacket } from "@/lib/ops/approvalPackets";
import {
  COMPLIANCE_HITL_WORKFLOW_ID,
  COMPLIANCE_HITL_SUSPEND_STEP_ID,
  buildHitlOpenKey,
  type HitlContext,
} from "@/lib/hitl/schemas";

vi.mock("@/lib/config", () => ({
  env: {
    DRY_RUN: true,
    DEMO_DATE: "2026-03-14T00:00:00.000Z",
    DATABASE_URL: "postgresql://localhost:5432/cerebro_test",
    REDIS_URL: "redis://localhost:6379",
    NODE_ENV: "test",
  },
}));

function sampleHitl(clientId = "CLT-OPS"): HitlContext {
  const openKey = buildHitlOpenKey("escalateToComplianceOfficer", 2);
  return {
    workflowId: COMPLIANCE_HITL_WORKFLOW_ID,
    workflowRunId: "run-ops-1",
    suspendStepId: COMPLIANCE_HITL_SUSPEND_STEP_ID,
    toolName: "escalateToComplianceOfficer",
    actionType: "ESCALATE_COMPLIANCE",
    agentType: "COMPLIANCE",
    stage: 2,
    reasoning: "KYC expired beyond ladder stage 2 — needs officer review.",
    policyVersion: "tool-policy-v1",
    documentId: `${clientId}-KYC_FORM`,
    openKey,
  };
}

describe("buildApprovalPacket", () => {
  it("includes ledger reason codes, cited doc, and decide endpoint for pending HITL", async () => {
    const clientId = "CLT-OPS";
    const hitl = sampleHitl(clientId);
    const vault = new VaultService({ clientId }, {} as never);

    vault.getDocuments = vi.fn(async () => [
      {
        id: `${clientId}-KYC_FORM`,
        type: "KYC_FORM",
        category: "COMPLIANCE",
        status: "EXPIRED",
        expiryDate: new Date("2025-01-01T00:00:00.000Z"),
        notes: "Past DEMO_DATE",
      },
      {
        id: `${clientId}-GOVERNMENT_ID`,
        type: "GOVERNMENT_ID",
        category: "IDENTITY",
        status: "VALID",
        expiryDate: new Date("2027-01-01T00:00:00.000Z"),
        notes: null,
      },
    ]);

    vault.getActionHistory = vi.fn(async () => [
      {
        id: "ACT-1",
        actionType: "ESCALATE_COMPLIANCE",
        agentType: "COMPLIANCE",
        reasoning: "Awaiting advisor approval",
        outcome: "PENDING_APPROVAL",
        stage: 2,
        policyVersion: "tool-policy-v1",
        promptVersionId: "pv-1",
        actor: "AGENT",
        reasonCodes: ["POLICY_REQUIRES_APPROVAL", "KYC_EXPIRED"],
        citedFields: { documentId: `${clientId}-KYC_FORM` },
        performedAt: new Date("2026-03-14T12:00:00.000Z"),
      },
    ]);

    vault.getClientId = () => clientId;

    const packet = await buildApprovalPacket({
      vault,
      clientName: "Ops Client",
      escalation: {
        id: "esc-1",
        clientId,
        openKey: hitl.openKey,
        status: EscalationStatus.PENDING_APPROVAL,
        ladderStage: 2,
        reasonCodes: ["POLICY_REQUIRES_APPROVAL"],
        policyVersion: "tool-policy-v1",
        hitlContext: hitl,
        documentId: hitl.documentId,
        openedAt: new Date("2026-03-14T11:00:00.000Z"),
        updatedAt: new Date("2026-03-14T11:00:00.000Z"),
      },
    });

    expect(packet.clientId).toBe(clientId);
    expect(packet.openKey).toBe(hitl.openKey);
    expect(packet.status).toBe("PENDING_APPROVAL");
    expect(packet.hitl?.toolName).toBe("escalateToComplianceOfficer");
    expect(packet.hitl?.reasoning).toContain("KYC expired");
    expect(packet.reasonCodes).toContain("POLICY_REQUIRES_APPROVAL");
    expect(packet.citedDocument?.type).toBe("KYC_FORM");
    expect(packet.citedDocument?.status).toBe("EXPIRED");
    expect(packet.vaultEvidence.some((d) => d.status === "EXPIRED")).toBe(
      true,
    );
    expect(packet.ledgerEvidence[0]?.reasonCodes).toEqual(
      expect.arrayContaining(["POLICY_REQUIRES_APPROVAL", "KYC_EXPIRED"]),
    );
    expect(packet.ledgerEvidence[0]?.promptVersionId).toBe("pv-1");
    expect(packet.decideEndpoint).toBe("/api/approvals/decide");
    expect(packet.packetId).toBe(`${clientId}:${hitl.openKey}`);
  });

  it("rejects vault/escalation clientId mismatch", async () => {
    const vault = new VaultService({ clientId: "CLT-A" }, {} as never);
    vault.getClientId = () => "CLT-A";
    vault.getDocuments = vi.fn(async () => []);
    vault.getActionHistory = vi.fn(async () => []);

    await expect(
      buildApprovalPacket({
        vault,
        clientName: "A",
        escalation: {
          id: "esc-x",
          clientId: "CLT-B",
          openKey: "hitl:x:stage-1",
          status: EscalationStatus.PENDING_APPROVAL,
          ladderStage: 1,
          reasonCodes: [],
          openedAt: new Date("2026-03-14T00:00:00.000Z"),
        },
      }),
    ).rejects.toThrow(/does not match/);
  });
});
