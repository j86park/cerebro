import { describe, expect, it } from "vitest";
import type { VaultService } from "@/lib/db/vault-service";
import { getComplianceScorecard } from "@/lib/compliance/scorecard";

describe("requested documents in the compliance scorecard", () => {
  it("keeps an unreceived identity document blocked rather than compliant", async () => {
    const vault = {
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
});
