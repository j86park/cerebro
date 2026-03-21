import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildGetDocumentComplianceStatus } from "../../src/tools/compliance/getDocumentComplianceStatus";
import { VaultService } from "../../src/lib/db/vault-service";
import { DocumentStatus } from "../../src/lib/db/enums";

// Mock VaultService
vi.mock("../../src/lib/db/vault-service");

describe("Rule Engine Execution - Conditional & Multi-Doc", () => {
  let mockVault: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockVault = {
      getClientProfile: vi.fn(),
      getDocuments: vi.fn(),
    };
  });

  it("should enforce corporate-specific document requirements for CORPORATE accounts", async () => {
    mockVault.getClientProfile.mockResolvedValue({
      id: "CLT-CORP",
      accountType: "CORPORATE",
    });

    // Provide some existing docs but NOT the corporate ones
    mockVault.getDocuments.mockResolvedValue([
      { id: "doc-1", type: "GOVERNMENT_ID", status: DocumentStatus.VALID, category: "IDENTITY" },
    ]);

    const tool = buildGetDocumentComplianceStatus(mockVault as any);
    const result = (await (tool as any).execute({ includeValid: true })) as any;

    const types = result.documents.map((d: any) => d.type);
    
    expect(types).toContain("ARTICLES_OF_INCORPORATION");
    expect(types).toContain("AUTHORIZED_SIGNATORY_LIST");
    
    const articles = result.documents.find((d: any) => d.type === "ARTICLES_OF_INCORPORATION");
    expect(articles?.status).toBe(DocumentStatus.MISSING);
    expect(articles?.urgency).toBe("LOW");
  });

  it("should flag missing IDENTITY documents as blockers", async () => {
    mockVault.getClientProfile.mockResolvedValue({
      id: "CLT-001",
      accountType: "INDIVIDUAL",
    });

    // MISSING Government ID
    mockVault.getDocuments.mockResolvedValue([]);

    const tool = buildGetDocumentComplianceStatus(mockVault as any);
    const result = (await (tool as any).execute({ includeValid: true })) as any;

    const govId = result.documents.find((d: any) => d.type === "GOVERNMENT_ID");
    expect(govId?.isBlocker).toBe(true);
    expect(govId?.urgency).toBe("HIGH"); // Higher urgency for missing identity
    expect(result.summary.hasBlocker).toBe(true);
  });

  it("should correctly identify existing docs and only flag truly missing ones", async () => {
    mockVault.getClientProfile.mockResolvedValue({
      id: "CLT-002",
      accountType: "INDIVIDUAL",
    });

    mockVault.getDocuments.mockResolvedValue([
      { id: "doc-1", type: "GOVERNMENT_ID", status: DocumentStatus.VALID, category: "IDENTITY" },
      { id: "doc-2", type: "PROOF_OF_ADDRESS", status: DocumentStatus.VALID, category: "IDENTITY" },
    ]);

    const tool = buildGetDocumentComplianceStatus(mockVault as any);
    const result = (await (tool as any).execute({ includeValid: false })) as any; // Only problems

    const types = result.documents.map((d: any) => d.type);
    expect(types).not.toContain("GOVERNMENT_ID");
    expect(types).toContain("SIN_SSN_FORM"); // This one is missing
  });
});
