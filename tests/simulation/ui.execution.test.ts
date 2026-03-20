import { describe, it, expect } from "vitest";

describe.skipIf(process.env.RUN_SCORECARD_E2E !== "true")(
  "Phase 9.3: Compliance Scorecard API Verification",
  () => {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const testClientId = "CLT-002"; // Corporate client from previous tests

  it("should return a 200 and valid scorecard data for a known client", async () => {
    const res = await fetch(`${baseUrl}/api/vaults/${testClientId}/scorecard`);
    expect(res.status).toBe(200);
    
    const data = await res.json();
    
    // Verify Scorecard Structure
    expect(data.scorecard).toBeDefined();
    expect(data.scorecard.summary).toBeDefined();
    expect(data.scorecard.summary.score).toBeGreaterThanOrEqual(0);
    expect(data.scorecard.summary.score).toBeLessThanOrEqual(100);
    expect(data.scorecard.documents).toBeInstanceOf(Array);
    
    // Verify Audit Trail Structure
    expect(data.auditTrail).toBeInstanceOf(Array);
    
    console.log(`Verified scorecard for ${testClientId}. Score: ${data.scorecard.summary.score}`);
  });

  it("should accurately reflect corporate document requirements in the scorecard", async () => {
    const res = await fetch(`${baseUrl}/api/vaults/${testClientId}/scorecard`);
    const data = await res.json();
    
    const docTypes = data.scorecard.documents.map((d: any) => d.type);
    
    // Corporate requirements should include these
    expect(docTypes).toContain("ARTICLES_OF_INCORPORATION");
    expect(docTypes).toContain("AUTHORIZED_SIGNATORY_LIST");
  });
});
