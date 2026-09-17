import { describe, expect, it, vi } from "vitest";
import { VaultService } from "@/lib/db/vault-service";
import {
  rankDocumentsByUrgency,
  type ScorecardDocument,
} from "@/lib/compliance/scorecard";
import { buildPrioritizeDocuments } from "@/tools/compliance/prioritizeDocuments";
import { buildComplianceTools } from "@/tools/compliance";
import { hashTrajectoryFixtureContent } from "@/evals/fixtures/hash";

vi.mock("@/lib/config", () => ({
  env: {
    DRY_RUN: true,
    DEMO_DATE: "2026-03-14T00:00:00.000Z",
    TOOL_POLICY_VERSION: "tool-policy-v1",
  },
}));

vi.mock("@/lib/compliance/scorecard", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/compliance/scorecard")
  >("@/lib/compliance/scorecard");
  return {
    ...actual,
    getComplianceScorecard: vi.fn(),
  };
});

import { getComplianceScorecard } from "@/lib/compliance/scorecard";

function stubVault(): VaultService {
  return new VaultService({ clientId: "CLT-007" }, {} as never);
}

function doc(
  partial: Partial<ScorecardDocument> &
    Pick<ScorecardDocument, "type" | "urgency">,
): ScorecardDocument {
  return {
    documentId: partial.documentId ?? `doc-${partial.type}`,
    type: partial.type,
    category: partial.category ?? "KYC",
    status: partial.status ?? "EXPIRING_SOON",
    daysUntilExpiry: partial.daysUntilExpiry ?? null,
    notificationCount: partial.notificationCount ?? 0,
    lastNotifiedAt: partial.lastNotifiedAt ?? null,
    urgency: partial.urgency,
    regulatoryNote: partial.regulatoryNote ?? "",
    isBlocker: partial.isBlocker ?? false,
  };
}

describe("rankDocumentsByUrgency", () => {
  it("orders CRITICAL before nearer EXPIRING_SOON before MISSING", () => {
    const ranked = rankDocumentsByUrgency([
      doc({ type: "KYC_FORM", urgency: "MEDIUM", daysUntilExpiry: 12 }),
      doc({ type: "GOVERNMENT_ID", urgency: "CRITICAL", status: "EXPIRED" }),
      doc({
        type: "AML_VERIFICATION",
        urgency: "MEDIUM",
        daysUntilExpiry: 8,
      }),
      doc({ type: "TRUST_AGREEMENT", urgency: "LOW", status: "MISSING" }),
    ]);

    expect(ranked.map((d) => d.type)).toEqual([
      "GOVERNMENT_ID",
      "AML_VERIFICATION",
      "KYC_FORM",
      "TRUST_AGREEMENT",
    ]);
    expect(ranked[0]?.rank).toBe(1);
    expect(ranked[1]?.rank).toBe(2);
  });

  it("prefers blockers within the same urgency bucket", () => {
    const ranked = rankDocumentsByUrgency([
      doc({
        type: "KYC_FORM",
        urgency: "HIGH",
        daysUntilExpiry: 5,
        isBlocker: false,
      }),
      doc({
        type: "GOVERNMENT_ID",
        urgency: "HIGH",
        daysUntilExpiry: 5,
        isBlocker: true,
        status: "MISSING",
      }),
    ]);
    expect(ranked[0]?.type).toBe("GOVERNMENT_ID");
  });
});

describe("prioritizeDocuments tool", () => {
  it("returns ranked issues and topPriority from scorecard", async () => {
    const vault = stubVault();
    vi.mocked(getComplianceScorecard).mockResolvedValue({
      documents: [
        doc({ type: "KYC_FORM", urgency: "MEDIUM", daysUntilExpiry: 12 }),
        doc({
          type: "AML_VERIFICATION",
          urgency: "MEDIUM",
          daysUntilExpiry: 8,
        }),
        doc({
          type: "RISK_QUESTIONNAIRE",
          urgency: "MEDIUM",
          daysUntilExpiry: 10,
        }),
        doc({
          type: "GOVERNMENT_ID",
          urgency: "NONE",
          status: "VALID",
          daysUntilExpiry: 200,
        }),
      ],
      summary: {
        totalDocuments: 4,
        expiredCount: 0,
        expiringSoonCount: 3,
        missingCount: 0,
        highestUrgency: "MEDIUM",
        hasBlocker: false,
        score: 85,
      },
    });

    const tool = buildPrioritizeDocuments(vault);
    const result = await (
      tool as unknown as {
        execute: (i: {
          includeValid?: boolean;
          limit?: number;
        }) => Promise<{
          topPriority: { type: string; rank: number } | null;
          rankedDocuments: Array<{ type: string }>;
          summary: { issueCount: number; highestUrgency: string };
        }>;
      }
    ).execute({});

    expect(result.summary.issueCount).toBe(3);
    expect(result.summary.highestUrgency).toBe("MEDIUM");
    expect(result.topPriority?.type).toBe("AML_VERIFICATION");
    expect(result.topPriority?.rank).toBe(1);
    expect(result.rankedDocuments.map((d) => d.type)).toEqual([
      "AML_VERIFICATION",
      "RISK_QUESTIONNAIRE",
      "KYC_FORM",
    ]);
  });

  it("is wired on compliance toolset allowlist", () => {
    const vault = stubVault();
    const keys = Object.keys(buildComplianceTools(vault));
    expect(keys).toContain("prioritizeDocuments");
  });
});

describe("CLT-007 prioritize fixture hash", () => {
  it("matches golden-pass tool path hash", () => {
    const toolNames = [
      "getDocumentComplianceStatus",
      "prioritizeDocuments",
      "sendAdvisorAlert",
    ];
    expect(hashTrajectoryFixtureContent("CLT-007", toolNames)).toBe(
      "e39dad83456bba38c7549bc9ed7b7dc2faf1248aae86a48e130355fc5667a2af",
    );
  });
});
