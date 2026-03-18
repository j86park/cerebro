import { describe, it, expect, vi } from "vitest";

// Use vi.hoisted to ensure these are available early
const { mockScorers } = vi.hoisted(() => {
  const factory = (id: string) => ({
    id,
    run: vi.fn().mockResolvedValue({ score: 1.0, reason: "Mocked pass" }),
  });
  return {
    mockScorers: {
      escalationStageScorer: factory("escalationStageScorer"),
      duplicateActionScorer: factory("duplicateActionScorer"),
      documentPriorityScorer: factory("documentPriorityScorer"),
      onboardingStageScorer: factory("onboardingStageScorer"),
      reasoningQualityScorer: factory("reasoningQualityScorer"),
    }
  };
});

vi.mock("@/evals/scorers", () => mockScorers);

import { runAllEvals } from "../../src/evals/run";
import { complianceScenarios } from "../../src/evals/scenarios/compliance.eval";
import { onboardingScenarios } from "../../src/evals/scenarios/onboarding.eval";

// Mocking other dependencies
vi.mock("../../src/agents/compliance/agent", () => ({
  complianceAgent: {
    generate: vi.fn(() => Promise.resolve({ text: "Compliance action taken" })),
  },
}));
vi.mock("../../src/agents/onboarding/agent", () => ({
  onboardingAgent: {
    generate: vi.fn(() => Promise.resolve({ text: "Onboarding action taken" })),
  },
}));
vi.mock("@/lib/db/vault-service", () => ({
  VaultService: vi.fn().mockImplementation(function() {
    return {
      getClientProfile: vi.fn().mockResolvedValue({ id: "CLT-TEST", accountType: "INDIVIDUAL" }),
      getDocuments: vi.fn().mockResolvedValue([]),
    };
  }),
}));
vi.mock("@/tools/shared", () => ({ buildSharedTools: vi.fn() }));
vi.mock("@/tools/compliance", () => ({ buildComplianceTools: vi.fn() }));
vi.mock("@/tools/onboarding", () => ({ buildOnboardingTools: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  prisma: {
    evalRun: {
      create: vi.fn().mockResolvedValue({ id: "eval-1" }),
    },
  },
}));

describe("Eval Runner - Coverage & Batching", () => {
  it("should process all 30 scenarios (15 new + 15 old)", async () => {
    const totalScenarios = complianceScenarios.length + onboardingScenarios.length;
    expect(totalScenarios).toBe(30);
  });

  it("should aggregate results correctly for a batch run", async () => {
    console.log("DEBUG: First scenario scorers count:", complianceScenarios[0]?.scorers?.length);
    console.log("DEBUG: First scenario scorer 0:", complianceScenarios[0]?.scorers?.[0]);

    const result = await runAllEvals(5); 

    console.log("DEBUG: Result summary passed:", result.overallScore);
    console.log("DEBUG: Scenario results count:", Object.keys(result.scenarioResults).length);
    
    expect(result).toBeDefined();
    expect(Object.keys(result.scenarioResults).length).toBe(30);
    expect(result.overallScore).toBe(1.0); // All mocks return 1.0
  });
});
