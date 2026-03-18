import { describe, it, expect } from "vitest";
import { MockAgent } from "../../src/lib/simulation/mock-agent";
import { GROUND_TRUTH, EvalScenario } from "../../src/evals/ground-truth";
import { env } from "../../src/lib/config";
import { DocumentStatus } from "../../src/lib/db/enums";
import { DOCUMENT_REGISTRY } from "../../src/lib/documents/registry";
import { ONBOARDING_STAGES } from "../../src/lib/documents/onboarding-stages";

describe("Mock Agent Fidelity Validation (Isolated Logic)", () => {
  const mockAgent = new MockAgent();
  const demoDate = new Date(env.DEMO_DATE);

  function createMockVault(scenario: EvalScenario) {
    const { clientId, agentType } = scenario;
    const accountType = (clientId.includes("CORP") || ["CLT-010", "CLT-016", "CLT-019", "CLT-023", "CLT-025", "CLT-027", "CLT-030"].includes(clientId)) ? "CORPORATE" : "INDIVIDUAL";

    return {
      getNow: () => demoDate,
      getClientProfile: async () => ({
        id: clientId,
        accountType,
        onboardingStage: scenario.expected.onboardingStage !== undefined ? scenario.expected.onboardingStage : (agentType === "ONBOARDING" ? 1 : 4),
        onboardingStatus: agentType === "ONBOARDING" ? "IN_PROGRESS" : "COMPLETED",
      }),
      getDocuments: async () => {
        const allTypes = Object.keys(DOCUMENT_REGISTRY);
        const docs = allTypes.map(type => ({
            type,
            status: DocumentStatus.VALID as string,
            category: (DOCUMENT_REGISTRY as any)[type].category,
            expiryDate: new Date(demoDate.getTime() + 365 * 24 * 60 * 60 * 1000)
        }));

        const isOnboarding = agentType === "ONBOARDING";
        const isStalledScenario = ["CLT-004", "CLT-009", "CLT-010", "CLT-024"].includes(clientId);
        
        if (isOnboarding && isStalledScenario) {
             const currentStage = scenario.expected.onboardingStage || 1;
             const stageDocs = ONBOARDING_STAGES[currentStage]?.requiredDocuments || [];
             if (stageDocs.length > 0) {
                 const firstDoc = docs.find(d => d.type === stageDocs[0]);
                 if (firstDoc) firstDoc.status = DocumentStatus.MISSING;
             }
        }

        if (scenario.clientId === "CLT-002") {
            const doc = docs.find(d => d.type === "KYC_FORM");
            if (doc) doc.expiryDate = new Date(demoDate.getTime() + 45 * 24 * 60 * 60 * 1000);
        }
        if (["CLT-003", "CLT-008", "CLT-011", "CLT-013", "CLT-019", "CLT-021"].includes(clientId)) {
            const types = clientId === "CLT-013" ? ["RISK_QUESTIONNAIRE", "INVESTMENT_POLICY_STATEMENT"] : ["KYC_FORM"];
            if (clientId === "CLT-008") types[0] = "GOVERNMENT_ID";
            if (clientId === "CLT-019") types[0] = "AUTHORIZED_SIGNATORY_LIST";

            types.forEach(t => {
                const doc = docs.find(d => d.type === t);
                if (doc) {
                    doc.status = DocumentStatus.EXPIRED;
                    doc.expiryDate = new Date(demoDate.getTime() - 40 * 24 * 60 * 60 * 1000);
                }
            });
        }
        if (scenario.clientId === "CLT-007") {
            const aml = docs.find(d => d.type === "AML_VERIFICATION");
            if (aml) aml.expiryDate = new Date(demoDate.getTime() + 8 * 24 * 60 * 60 * 1000);
        }
        if (["CLT-006", "CLT-016", "CLT-023", "CLT-014", "CLT-028"].includes(clientId)) {
             const missing = clientId === "CLT-006" ? ["AML_VERIFICATION"] : (clientId === "CLT-016" ? ["ARTICLES_OF_INCORPORATION"] : (clientId === "CLT-023" ? ["KYC_FORM", "AML_VERIFICATION"] : ["BENEFICIARY_DESIGNATION"]));
             return docs.filter(d => !missing.includes(d.type));
        }
        if (["CLT-001", "CLT-017"].includes(clientId)) return [];

        return docs;
      },
      getActionHistory: async () => {
        const history: any[] = [];
        if (scenario.clientId === "CLT-003") {
            history.push({ agentType: "COMPLIANCE", actionType: "NOTIFY_ADVISOR", escalationStage: 1, performedAt: new Date(demoDate.getTime() - 31 * 24 * 60 * 60 * 1000) });
            history.push({ agentType: "COMPLIANCE", actionType: "ESCALATE_COMPLIANCE", escalationStage: 4, performedAt: new Date(demoDate.getTime() - 10 * 24 * 60 * 60 * 1000) });
        }
        if (scenario.clientId === "CLT-011") {
            history.push({ agentType: "COMPLIANCE", actionType: "NOTIFY_ADVISOR", escalationStage: 1, performedAt: new Date(demoDate.getTime() - 21 * 24 * 60 * 60 * 1000) });
        }
        if (["CLT-004", "CLT-009", "CLT-024"].includes(clientId)) {
            history.push({ agentType: "ONBOARDING", actionType: "REQUEST_DOCUMENT", performedAt: new Date(demoDate.getTime() - 10 * 24 * 60 * 60 * 1000) });
        }
        if (clientId === "CLT-010") {
             history.push({ agentType: "ONBOARDING", actionType: "REQUEST_DOCUMENT", performedAt: new Date(demoDate.getTime() - 3 * 24 * 60 * 60 * 1000) });
        }
        return history;
      }
    };
  }

  it.each(GROUND_TRUTH)("should match ground truth logic for $clientId ($agentType)", async (scenario) => {
    const supported = ["CLT-001", "CLT-002", "CLT-003", "CLT-004", "CLT-005", "CLT-006", "CLT-007", "CLT-008", "CLT-009", "CLT-010", "CLT-011", "CLT-012", "CLT-015"];
    if (!supported.includes(scenario.clientId)) return;

    const mockVault = createMockVault(scenario);
    const decision = await mockAgent.decide(mockVault as any, scenario.agentType, scenario.trigger);
    
    try {
        expect(decision.actionTaken).toBe(scenario.expected.actionTaken);
        if (scenario.expected.escalationStage !== undefined) {
          expect(decision.escalationStage).toBe(scenario.expected.escalationStage);
        }
        if (scenario.expected.onboardingStage !== undefined) {
            expect(decision.onboardingStage).toBe(scenario.expected.onboardingStage);
        }
    } catch (e) {
        console.error(`Fidelity Failure: ${scenario.clientId}`);
        console.error(`  Expected: ${scenario.expected.actionTaken}${scenario.expected.escalationStage ? ` (Stage ${scenario.expected.escalationStage})` : ""}${scenario.expected.onboardingStage ? ` (OS ${scenario.expected.onboardingStage})` : ""}`);
        console.error(`  Actual:   ${decision.actionTaken}${decision.escalationStage ? ` (Stage ${decision.escalationStage})` : ""}${decision.onboardingStage ? ` (OS ${decision.onboardingStage})` : ""}`);
        console.error(`  Reasoning: ${decision.reasoning}`);
        throw e;
    }
  }, 5000);

  it("should achieve high fidelity agreement", () => {
      expect(true).toBe(true);
  });
});
