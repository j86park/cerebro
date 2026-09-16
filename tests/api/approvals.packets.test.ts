import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const listPendingApprovalPackets = vi.fn();
const getApprovalPacket = vi.fn();
const getFirmSlaMetrics = vi.fn();

vi.mock("@/lib/ops/service", () => ({
  listPendingApprovalPackets: (...args: unknown[]) =>
    listPendingApprovalPackets(...args),
  getApprovalPacket: (...args: unknown[]) => getApprovalPacket(...args),
  getFirmSlaMetrics: (...args: unknown[]) => getFirmSlaMetrics(...args),
}));

vi.mock("@/lib/config", () => ({
  env: {
    DRY_RUN: true,
    DEMO_DATE: "2026-03-14T00:00:00.000Z",
    DATABASE_URL: "postgresql://localhost:5432/cerebro_test",
    REDIS_URL: "redis://localhost:6379",
    NODE_ENV: "test",
  },
}));

import { GET as GETPackets } from "@/app/api/approvals/packets/route";
import { GET as GETPacket } from "@/app/api/approvals/packets/[openKey]/route";
import { GET as GETMetrics } from "@/app/api/approvals/metrics/route";

const samplePacket = {
  packetId: "CLT-OPS:hitl:escalateToComplianceOfficer:stage-2",
  clientId: "CLT-OPS",
  clientName: "Ops Client",
  openKey: "hitl:escalateToComplianceOfficer:stage-2",
  status: "PENDING_APPROVAL",
  ladderStage: 2,
  reasonCodes: ["POLICY_REQUIRES_APPROVAL"],
  policyVersion: "tool-policy-v1",
  openedAt: "2026-03-14T11:00:00.000Z",
  hitl: {
    workflowId: "complianceHitlApproval",
    workflowRunId: "run-1",
    suspendStepId: "awaitAdvisorDecision",
    toolName: "escalateToComplianceOfficer",
    actionType: "ESCALATE_COMPLIANCE",
    agentType: "COMPLIANCE",
    stage: 2,
    reasoning: "Needs review",
    policyVersion: "tool-policy-v1",
    openKey: "hitl:escalateToComplianceOfficer:stage-2",
  },
  citedDocument: null,
  vaultEvidence: [],
  ledgerEvidence: [
    {
      id: "ACT-1",
      actionType: "ESCALATE_COMPLIANCE",
      agentType: "COMPLIANCE",
      reasoning: "Needs review",
      outcome: "PENDING_APPROVAL",
      reasonCodes: ["POLICY_REQUIRES_APPROVAL"],
      performedAt: "2026-03-14T12:00:00.000Z",
    },
  ],
  decideEndpoint: "/api/approvals/decide",
};

describe("GET /api/approvals/packets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns packet list under data with decideEndpoint for HITL", async () => {
    listPendingApprovalPackets.mockResolvedValue([samplePacket]);
    const res = await GETPackets(
      new NextRequest("http://localhost/api/approvals/packets"),
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data).toHaveLength(1);
    expect(json.data[0].decideEndpoint).toBe("/api/approvals/decide");
    expect(json.data[0].reasonCodes).toContain("POLICY_REQUIRES_APPROVAL");
    expect(json.total).toBe(1);
  });
});

describe("GET /api/approvals/packets/[openKey]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires clientId and returns a single packet", async () => {
    getApprovalPacket.mockResolvedValue(samplePacket);
    const openKey = encodeURIComponent(
      "hitl:escalateToComplianceOfficer:stage-2",
    );
    const res = await GETPacket(
      new NextRequest(
        `http://localhost/api/approvals/packets/${openKey}?clientId=CLT-OPS`,
      ),
      { params: Promise.resolve({ openKey }) },
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.clientId).toBe("CLT-OPS");
    expect(json.data.hitl.toolName).toBe("escalateToComplianceOfficer");
  });

  it("returns 400 when clientId missing", async () => {
    const res = await GETPacket(
      new NextRequest("http://localhost/api/approvals/packets/hitl%3Ax"),
      { params: Promise.resolve({ openKey: "hitl:x" }) },
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /api/approvals/metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns escalation_rate and timeout_rate", async () => {
    getFirmSlaMetrics.mockResolvedValue({
      escalation_rate: 0.2,
      timeout_rate: 0.25,
      pendingApprovals: 1,
      totalClients: 10,
      clientsWithEscalation: 2,
      hitlTimeouts: 1,
      hitlDecisions: 4,
      computedAt: "2026-03-14T00:00:00.000Z",
    });
    const res = await GETMetrics();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.escalation_rate).toBe(0.2);
    expect(json.data.timeout_rate).toBe(0.25);
  });
});
