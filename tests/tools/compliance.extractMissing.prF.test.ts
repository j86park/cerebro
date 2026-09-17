import { describe, expect, it, vi, beforeEach } from "vitest";
import { VaultService } from "@/lib/db/vault-service";
import { buildRefreshDocumentExtract } from "@/tools/shared/refreshDocumentExtract";
import { buildRequestMissingDocument } from "@/tools/compliance/requestMissingDocument";

const sendTransactionalEmail = vi.fn().mockResolvedValue({
  id: "dry-run",
  skipped: true,
});

vi.mock("@/lib/config", () => ({
  env: {
    DRY_RUN: true,
    DEMO_DATE: "2026-03-14T00:00:00.000Z",
    TOOL_POLICY_VERSION: "tool-policy-v1",
    DOCUMENT_EXTRACT_PROVIDER: "heuristic",
  },
}));

vi.mock("@/lib/email/resend", () => ({
  sendTransactionalEmail: (...args: unknown[]) =>
    sendTransactionalEmail(...args),
}));

vi.mock("@/lib/compliance/scorecard", () => ({
  getComplianceScorecard: vi.fn(),
}));

import { getComplianceScorecard } from "@/lib/compliance/scorecard";

describe("refreshDocumentExtract (PR-F / T1.6)", () => {
  it("re-runs extract and persists via VaultService", async () => {
    const vault = new VaultService({ clientId: "CLT-123" }, {} as never);
    vault.getDocumentById = vi.fn().mockResolvedValue({
      id: "doc-1",
      type: "GOVERNMENT_ID",
      fileRef: "/tmp/id.pdf",
    });
    vault.getDocumentContentForAgent = vi.fn().mockResolvedValue({
      documentId: "doc-1",
      type: "GOVERNMENT_ID",
      text: "Full Name: Ada Lovelace\nDate of Birth: 1815-12-10\nExpiry: 2027-01-01",
      strippedPatterns: [],
      agentContextBlock: "block",
    });
    vault.updateDocumentExtractedFields = vi.fn().mockResolvedValue({});
    vault.logAction = vi.fn().mockResolvedValue({ id: "a1" });

    const tool = buildRefreshDocumentExtract(vault);
    const result = await (
      tool as unknown as {
        execute: (i: {
          documentId: string;
          reasoning: string;
          agentType?: "COMPLIANCE" | "ONBOARDING";
        }) => Promise<{ success: boolean; fieldCount: number }>;
      }
    ).execute({
      documentId: "doc-1",
      reasoning:
        "Extracted fields were empty after upload; refreshing before validation.",
      agentType: "ONBOARDING",
    });

    expect(result.success).toBe(true);
    expect(result.fieldCount).toBeGreaterThanOrEqual(0);
    expect(vault.updateDocumentExtractedFields).toHaveBeenCalledWith(
      "doc-1",
      expect.objectContaining({ provider: "heuristic" }),
    );
    expect(vault.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        agentType: "ONBOARDING",
        outcome: "EXTRACT_REFRESHED",
      }),
    );
  });
});

describe("requestMissingDocument (PR-F / T1.7)", () => {
  beforeEach(() => {
    sendTransactionalEmail.mockClear();
    vi.mocked(getComplianceScorecard).mockReset();
  });

  it("requests a MISSING scorecard type under DRY_RUN", async () => {
    vi.mocked(getComplianceScorecard).mockResolvedValue({
      documents: [
        {
          documentId: null,
          type: "AML_VERIFICATION",
          category: "COMPLIANCE",
          status: "MISSING",
          daysUntilExpiry: null,
          notificationCount: 0,
          lastNotifiedAt: null,
          urgency: "LOW",
          regulatoryNote: "Missing AML",
          isBlocker: false,
        },
      ],
      summary: {
        totalDocuments: 1,
        expiredCount: 0,
        expiringSoonCount: 0,
        missingCount: 1,
        highestUrgency: "LOW",
        hasBlocker: false,
      },
    } as never);

    const vault = new VaultService({ clientId: "CLT-006" }, {} as never);
    vault.getActionHistory = vi.fn().mockResolvedValue([]);
    vault.checkActionCooldown = vi.fn().mockResolvedValue(undefined);
    vault.getClientProfile = vi.fn().mockResolvedValue({
      email: "client@example.com",
    });
    vault.upsertDocument = vi.fn().mockResolvedValue({});
    vault.logAction = vi.fn().mockResolvedValue({ id: "a2" });

    const tool = buildRequestMissingDocument(vault);
    const result = await (
      tool as unknown as {
        execute: (i: {
          documentType: string;
          message: string;
          reasoning: string;
        }) => Promise<{ dryRun: boolean; wasMissing: boolean }>;
      }
    ).execute({
      documentType: "AML_VERIFICATION",
      message: "Please upload your AML verification documents.",
      reasoning:
        "Scorecard shows AML_VERIFICATION as MISSING for this onboarded client.",
    });

    expect(result.dryRun).toBe(true);
    expect(result.wasMissing).toBe(true);
    expect(sendTransactionalEmail).toHaveBeenCalled();
    expect(vault.upsertDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "AML_VERIFICATION",
        status: "REQUESTED",
      }),
    );
    expect(vault.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        agentType: "COMPLIANCE",
        actionType: "REQUEST_DOCUMENT",
        outcome: "DRY_RUN",
      }),
    );
  });

  it("throws when document type is not MISSING", async () => {
    vi.mocked(getComplianceScorecard).mockResolvedValue({
      documents: [
        {
          documentId: "doc-x",
          type: "AML_VERIFICATION",
          category: "COMPLIANCE",
          status: "VALID",
          daysUntilExpiry: 100,
          notificationCount: 0,
          lastNotifiedAt: null,
          urgency: "NONE",
          regulatoryNote: "ok",
          isBlocker: false,
        },
      ],
      summary: {
        totalDocuments: 1,
        expiredCount: 0,
        expiringSoonCount: 0,
        missingCount: 0,
        highestUrgency: "NONE",
        hasBlocker: false,
      },
    } as never);

    const vault = new VaultService({ clientId: "CLT-006" }, {} as never);
    const tool = buildRequestMissingDocument(vault);
    await expect(
      (
        tool as unknown as {
          execute: (i: {
            documentType: string;
            message: string;
            reasoning: string;
          }) => Promise<unknown>;
        }
      ).execute({
        documentType: "AML_VERIFICATION",
        message: "Please upload AML.",
        reasoning: "Attempting request without a MISSING scorecard row present.",
      }),
    ).rejects.toThrow(/not MISSING/);
  });
});
