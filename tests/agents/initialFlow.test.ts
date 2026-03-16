import { describe, expect, it } from "vitest";
import { complianceAgent } from "@/agents/compliance/agent";
import { onboardingAgent } from "@/agents/onboarding/agent";

describe("Agent Initial Flow", () => {
  it("exports a valid compliance mastra agent", () => {
    expect(complianceAgent).toBeDefined();
    expect(complianceAgent.name).toBe("Cerebro Compliance Agent");
  });

  it("exports a valid onboarding mastra agent", () => {
    expect(onboardingAgent).toBeDefined();
    expect(onboardingAgent.name).toBe("Cerebro Onboarding Agent");
  });
});
