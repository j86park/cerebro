import { describe, expect, it, vi } from "vitest";
import { VaultService } from "@/lib/db/vault-service";
import { buildGetOpenEscalations } from "@/tools/shared/getOpenEscalations";
import { buildGetDocumentForReview } from "@/tools/shared/getDocumentForReview";
import { buildGetChecklistGaps } from "@/tools/shared/getChecklistGaps";
import { buildSharedTools } from "@/tools/shared";

vi.mock("@/lib/config", () => ({
  env: {
    DRY_RUN: true,
    DEMO_DATE: "2026-03-14T00:00:00.000Z",
    TOOL_POLICY_VERSION: "tool-policy-v1",
  },
}));

function stubVault(): VaultService {
  return new VaultService({ clientId: "CLT-123" }, {} as never);
}

describe("getOpenEscalations", () => {
  it("maps open EscalationState rows", async () => {
    const vault = stubVault();
    vault.getEscalationStates = vi.fn().mockResolvedValue([
      {
        id: "esc-1",
        openKey: "stage-4:doc-1",
        ladderStage: 4,
        status: "PENDING_APPROVAL",
        documentId: "doc-1",
        reasonCodes: ["HITL_REQUIRED"],
        policyVersion: "tool-policy-v1",
        openedAt: new Date("2026-03-10T00:00:00.000Z"),
      },
    ]);

    const tool = buildGetOpenEscalations(vault);
    const result = await (
      tool as unknown as {
        execute: () => Promise<{
          openCount: number;
          escalations: Array<{ openKey: string | null; status: string }>;
        }>;
      }
    ).execute();

    expect(vault.getEscalationStates).toHaveBeenCalledWith({ openOnly: true });
    expect(result.openCount).toBe(1);
    expect(result.escalations[0]).toMatchObject({
      openKey: "stage-4:doc-1",
      status: "PENDING_APPROVAL",
      ladderStage: 4,
      openedAt: "2026-03-10T00:00:00.000Z",
    });
  });
});

describe("getDocumentForReview", () => {
  it("returns sanitized content + extracted fields", async () => {
    const vault = stubVault();
    vault.getDocumentById = vi.fn().mockResolvedValue({
      id: "doc-9",
      type: "GOVERNMENT_ID",
      status: "PENDING_REVIEW",
    });
    vault.getDocumentContentForAgent = vi.fn().mockResolvedValue({
      documentId: "doc-9",
      type: "GOVERNMENT_ID",
      text: "Name: Ada",
      strippedPatterns: ["EMAIL"],
      agentContextBlock: "<untrusted>Name: Ada</untrusted>",
    });
    vault.getDocumentExtractedFields = vi.fn().mockResolvedValue({
      provider: "heuristic",
      documentType: "GOVERNMENT_ID",
      fields: [
        {
          key: "fullName",
          label: "Full name",
          value: "Ada",
          confidence: 0.9,
          citation: {
            source: "raw_text",
            startOffset: 0,
            endOffset: 3,
            page: null,
          },
        },
      ],
      adapterNotes: [],
      extractedAt: "2026-03-14T00:00:00.000Z",
    });

    const tool = buildGetDocumentForReview(vault);
    const result = await (
      tool as unknown as {
        execute: (i: { documentId: string }) => Promise<{
          documentId: string;
          status: string | null;
          extractedFields: { provider: string } | null;
        }>;
      }
    ).execute({ documentId: "doc-9" });

    expect(result.documentId).toBe("doc-9");
    expect(result.status).toBe("PENDING_REVIEW");
    expect(result.extractedFields?.provider).toBe("heuristic");
  });
});

describe("getChecklistGaps", () => {
  it("returns gap DTO for stage checklist", async () => {
    const vault = stubVault();
    vault.getClientProfile = vi.fn().mockResolvedValue({
      onboardingStage: 1,
      accountType: "INVESTMENT",
      riskProfile: null,
    });
    vault.getDocuments = vi.fn().mockResolvedValue([]);

    const tool = buildGetChecklistGaps(vault);
    const result = await (
      tool as unknown as {
        execute: (i?: { stage?: number }) => Promise<{
          gapCount: number;
          gaps: Array<{ documentType: string; reason: string }>;
          requiredDocuments: string[];
        }>;
      }
    ).execute({});

    expect(result.gapCount).toBeGreaterThan(0);
    expect(result.requiredDocuments.length).toBeGreaterThan(0);
    expect(result.gaps.every((g) => g.reason === "MISSING")).toBe(true);
  });
});

describe("shared toolset allowlist (PR-E)", () => {
  it("includes observation tools on shared builder", () => {
    const vault = stubVault();
    const keys = Object.keys(buildSharedTools(vault));
    expect(keys).toEqual(
      expect.arrayContaining([
        "getOpenEscalations",
        "getDocumentForReview",
        "getChecklistGaps",
      ]),
    );
  });
});
