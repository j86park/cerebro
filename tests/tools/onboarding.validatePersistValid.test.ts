import { describe, expect, it, vi } from "vitest";
import { VaultService } from "@/lib/db/vault-service";
import { buildValidateDocumentReceived } from "@/tools/onboarding/validateDocumentReceived";
import { buildSetDocumentStatus } from "@/tools/onboarding/setDocumentStatus";
import { buildAdvanceOnboardingStage } from "@/tools/onboarding/advanceOnboardingStage";

vi.mock("@/lib/config", () => ({
  env: {
    DRY_RUN: true,
    DEMO_DATE: "2026-03-14T00:00:00.000Z",
    TOOL_POLICY_VERSION: "tool-policy-v1",
  },
}));

describe("validateDocumentReceived → VALID (PR-B)", () => {
  it("persists VALID for a PENDING_REVIEW upload that passes admission checks", async () => {
    const vault = new VaultService({ clientId: "CLT-123" }, {} as never);
    vault.getDocuments = vi.fn().mockResolvedValue([
      {
        id: "doc-poa",
        type: "PROOF_OF_ADDRESS",
        status: "PENDING_REVIEW",
        uploadedAt: "2025-06-01T00:00:00.000Z",
        expiryDate: null,
      },
    ]);
    vault.getDocumentExtractedFields = vi.fn().mockResolvedValue(null);
    vault.updateDocumentStatus = vi.fn().mockResolvedValue({});
    vault.logAction = vi.fn().mockResolvedValue({ id: "a1" });

    const tool = buildValidateDocumentReceived(vault);
    const result = await (
      tool as unknown as {
        execute: (i: { documentId: string }) => Promise<{
          valid: boolean;
          statusPersisted: boolean;
          status: string;
        }>;
      }
    ).execute({ documentId: "doc-poa" });

    expect(result.valid).toBe(true);
    expect(result.statusPersisted).toBe(true);
    expect(result.status).toBe("VALID");
    expect(vault.updateDocumentStatus).toHaveBeenCalledWith(
      "doc-poa",
      "VALID",
      expect.any(String),
    );
    expect(vault.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "VALIDATE_DOCUMENT",
        outcome: "DOCUMENT_VALID",
        reasonCodes: expect.arrayContaining([
          "VALIDATOR_PASS",
          "STATUS_PERSISTED_VALID",
        ]),
      }),
    );
  });

  it("does not persist status when admission fails (stale recency)", async () => {
    const vault = new VaultService({ clientId: "CLT-123" }, {} as never);
    vault.getDocuments = vi.fn().mockResolvedValue([
      {
        id: "doc-poa",
        type: "PROOF_OF_ADDRESS",
        status: "PENDING_REVIEW",
        uploadedAt: "2025-03-01T00:00:00.000Z",
        expiryDate: null,
      },
    ]);
    vault.getDocumentExtractedFields = vi.fn().mockResolvedValue(null);
    vault.updateDocumentStatus = vi.fn();
    vault.logAction = vi.fn().mockResolvedValue({ id: "a1" });

    const tool = buildValidateDocumentReceived(vault);
    const result = await (
      tool as unknown as {
        execute: (i: { documentId: string }) => Promise<{
          valid: boolean;
          statusPersisted: boolean;
          gapReason: string | null;
        }>;
      }
    ).execute({ documentId: "doc-poa" });

    expect(result.valid).toBe(false);
    expect(result.statusPersisted).toBe(false);
    expect(result.gapReason).toBe("STALE_RECENCY");
    expect(vault.updateDocumentStatus).not.toHaveBeenCalled();
  });

  it("setDocumentStatus writes REQUESTED / PENDING_REVIEW / VALID", async () => {
    const vault = new VaultService({ clientId: "CLT-123" }, {} as never);
    vault.updateDocumentStatus = vi.fn().mockResolvedValue({});
    vault.logAction = vi.fn().mockResolvedValue({ id: "a1" });

    const tool = buildSetDocumentStatus(vault);
    const exec = (
      tool as unknown as {
        execute: (i: {
          documentId: string;
          status: "REQUESTED" | "PENDING_REVIEW" | "VALID";
          reasoning: string;
        }) => Promise<{ newStatus: string }>;
      }
    ).execute;

    await expect(
      exec({
        documentId: "d1",
        status: "REQUESTED",
        reasoning: "Marking document requested after client outreach email.",
      }),
    ).resolves.toEqual({
      success: true,
      documentId: "d1",
      newStatus: "REQUESTED",
    });

    await exec({
      documentId: "d1",
      status: "PENDING_REVIEW",
      reasoning: "Client uploaded a file; awaiting admission validation next.",
    });
    await exec({
      documentId: "d1",
      status: "VALID",
      reasoning: "Manual VALID write after offline review of the document.",
    });

    expect(vault.updateDocumentStatus).toHaveBeenCalledTimes(3);
  });

  it("upload → validate → VALID unblocks advanceOnboardingStage", async () => {
    const vault = new VaultService({ clientId: "CLT-123" }, {} as never);

    const docs = [
      {
        id: "doc-id",
        type: "GOVERNMENT_ID",
        status: "VALID",
        uploadedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "doc-poa",
        type: "PROOF_OF_ADDRESS",
        status: "PENDING_REVIEW",
        uploadedAt: "2025-06-01T00:00:00.000Z",
        expiryDate: null,
      },
      {
        id: "doc-sin",
        type: "SIN_SSN_FORM",
        status: "VALID",
        uploadedAt: "2026-01-01T00:00:00.000Z",
      },
    ];

    vault.getDocuments = vi.fn().mockImplementation(async () => docs);
    vault.getDocumentExtractedFields = vi.fn().mockResolvedValue(null);
    vault.updateDocumentStatus = vi.fn().mockImplementation(
      async (id: string, status: string) => {
        const doc = docs.find((d) => d.id === id);
        if (doc) doc.status = status;
        return {};
      },
    );
    vault.logAction = vi.fn().mockResolvedValue({ id: "a1" });
    vault.checkActionCooldown = vi.fn().mockResolvedValue(undefined);
    vault.getClientProfile = vi.fn().mockResolvedValue({
      onboardingStage: 1,
      onboardingStatus: "IN_PROGRESS",
      accountType: "RRSP",
      riskProfile: "MODERATE",
    });
    vault.upsertOnboardingStageState = vi.fn().mockResolvedValue({});

    const validate = buildValidateDocumentReceived(vault);
    const validateResult = await (
      validate as unknown as {
        execute: (i: { documentId: string }) => Promise<{
          valid: boolean;
          statusPersisted: boolean;
        }>;
      }
    ).execute({ documentId: "doc-poa" });

    expect(validateResult.valid).toBe(true);
    expect(validateResult.statusPersisted).toBe(true);
    expect(docs.find((d) => d.id === "doc-poa")?.status).toBe("VALID");

    const advance = buildAdvanceOnboardingStage(vault);
    await expect(
      (
        advance as unknown as {
          execute: (i: { reasoning: string }) => Promise<{
            success: boolean;
            newStage?: number;
          }>;
        }
      ).execute({
        reasoning:
          "All stage-1 identity documents are now VALID after the latest upload.",
      }),
    ).resolves.toMatchObject({ success: true });
  });
});
