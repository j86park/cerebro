import { describe, expect, it } from "vitest";
import type { VaultService } from "@/lib/db/vault-service";
import { getComplianceScorecard } from "@/lib/compliance/scorecard";

describe("requested documents in the compliance scorecard", () => {
  it("keeps an unreceived identity document blocked rather than compliant", async () => {
    const vault = {
      getNow: () => new Date("2026-09-28T12:00:00.000Z"),
      getClientProfile: async () => ({ accountType: "INVESTMENT" }),
      getDocuments: async () => [{
        id: "doc-1",
        type: "GOVERNMENT_ID",
        category: "IDENTITY",
        status: "REQUESTED",
        expiryDate: null,
        notificationCount: 1,
        lastNotifiedAt: null,
      }],
    } as unknown as VaultService;

    const scorecard = await getComplianceScorecard(vault);
    const id = scorecard.documents.find((doc) => doc.type === "GOVERNMENT_ID");
    expect(id).toMatchObject({
      status: "REQUESTED",
      urgency: "HIGH",
      isBlocker: true,
    });
    expect(id?.regulatoryNote).toContain("not yet received");
    expect(scorecard.summary.missingCount).toBeGreaterThan(0);
    expect(scorecard.summary.hasBlocker).toBe(true);
  });

  it("excludes a superseded expired row when a valid replacement exists", async () => {
    const vault = {
      getNow: () => new Date("2026-09-29T12:00:00.000Z"),
      getClientProfile: async () => ({ accountType: "INVESTMENT" }),
      getDocuments: async () => [
        { id: "old", type: "GOVERNMENT_ID", category: "IDENTITY", status: "SUPERSEDED",
          expiryDate: new Date("2025-01-01T00:00:00.000Z") },
        { id: "new", type: "GOVERNMENT_ID", category: "IDENTITY", status: "VALID",
          expiryDate: new Date("2027-01-01T00:00:00.000Z") },
      ],
    } as unknown as VaultService;
    const scorecard = await getComplianceScorecard(vault);
    expect(scorecard.documents.some((doc) => doc.documentId === "old")).toBe(false);
    expect(scorecard.documents.some((doc) => doc.documentId === "new" && doc.status === "VALID")).toBe(true);
    expect(scorecard.summary.expiredCount).toBe(0);
  });
});
