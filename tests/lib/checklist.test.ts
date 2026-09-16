import { describe, expect, it, vi } from "vitest";
import {
  computeChecklistGaps,
  resolveStageChecklist,
  validateDocumentDeterministic,
} from "@/lib/documents/checklist";

vi.mock("@/lib/config", () => ({
  env: {
    DRY_RUN: true,
    DEMO_DATE: "2026-03-14T00:00:00.000Z",
    TOOL_POLICY_VERSION: "tool-policy-v1",
  },
}));

describe("checklist resolveStageChecklist", () => {
  it("returns base stage-1 identity docs", () => {
    const cfg = resolveStageChecklist({
      stage: 1,
      accountType: "RRSP",
      riskProfile: "MODERATE",
    });
    expect(cfg?.requiredDocuments).toEqual([
      "GOVERNMENT_ID",
      "PROOF_OF_ADDRESS",
      "SIN_SSN_FORM",
    ]);
  });

  it("adds corporate + suitability extras at stage 2 for CORPORATE", () => {
    const cfg = resolveStageChecklist({
      stage: 2,
      accountType: "CORPORATE",
      riskProfile: "MODERATE",
    });
    expect(cfg?.requiredDocuments).toEqual(
      expect.arrayContaining([
        "NAAF",
        "RISK_QUESTIONNAIRE",
        "CLIENT_AGREEMENT",
        "ARTICLES_OF_INCORPORATION",
        "AUTHORIZED_SIGNATORY_LIST",
        "ACCREDITED_INVESTOR_FORM",
        "INVESTMENT_POLICY_STATEMENT",
      ]),
    );
  });

  it("adds suitability extras for AGGRESSIVE risk on individual-like accounts", () => {
    const cfg = resolveStageChecklist({
      stage: 2,
      accountType: "TFSA",
      riskProfile: "AGGRESSIVE",
    });
    expect(cfg?.requiredDocuments).toEqual(
      expect.arrayContaining([
        "ACCREDITED_INVESTOR_FORM",
        "INVESTMENT_POLICY_STATEMENT",
      ]),
    );
    expect(cfg?.requiredDocuments).not.toContain("ARTICLES_OF_INCORPORATION");
  });
});

describe("validateDocumentDeterministic vs DEMO_DATE", () => {
  it("fails VALID docs whose expiryDate is on DEMO_DATE", () => {
    const result = validateDocumentDeterministic(
      {
        type: "KYC_FORM",
        status: "VALID",
        expiryDate: "2026-03-14T00:00:00.000Z",
        uploadedAt: "2025-01-01T00:00:00.000Z",
      },
      "KYC_FORM",
    );
    expect(result.valid).toBe(false);
    expect(result.gapReason).toBe("EXPIRED");
    expect(result.expired).toBe(true);
  });

  it("fails PROOF_OF_ADDRESS outside 12-month recency", () => {
    const result = validateDocumentDeterministic(
      {
        type: "PROOF_OF_ADDRESS",
        status: "VALID",
        uploadedAt: "2025-03-01T00:00:00.000Z",
        expiryDate: null,
      },
      "PROOF_OF_ADDRESS",
    );
    expect(result.valid).toBe(false);
    expect(result.gapReason).toBe("STALE_RECENCY");
    expect(result.staleRecency).toBe(true);
  });

  it("passes PROOF_OF_ADDRESS within 12 months of DEMO_DATE", () => {
    const result = validateDocumentDeterministic(
      {
        type: "PROOF_OF_ADDRESS",
        status: "VALID",
        uploadedAt: "2025-06-01T00:00:00.000Z",
        expiryDate: null,
      },
      "PROOF_OF_ADDRESS",
    );
    expect(result.valid).toBe(true);
    expect(result.gapReason).toBeNull();
  });
});

describe("computeChecklistGaps", () => {
  it("reports missing and not-valid gaps for stage 1", () => {
    const gaps = computeChecklistGaps(
      { stage: 1, accountType: "RRSP", riskProfile: "CONSERVATIVE" },
      [
        {
          type: "GOVERNMENT_ID",
          status: "VALID",
          uploadedAt: "2026-01-01T00:00:00.000Z",
        },
        { type: "PROOF_OF_ADDRESS", status: "REQUESTED" },
      ],
    );
    expect(gaps.map((g) => g.documentType).sort()).toEqual([
      "PROOF_OF_ADDRESS",
      "SIN_SSN_FORM",
    ]);
    expect(gaps.find((g) => g.documentType === "SIN_SSN_FORM")?.reason).toBe(
      "MISSING",
    );
    expect(
      gaps.find((g) => g.documentType === "PROOF_OF_ADDRESS")?.reason,
    ).toBe("NOT_VALID");
  });
});
