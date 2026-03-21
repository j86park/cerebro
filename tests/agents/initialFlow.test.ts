import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    promptVersion: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    promptLesson: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

import { getComplianceAgent } from "@/agents/compliance/agent";
import { getOnboardingAgent } from "@/agents/onboarding/agent";

describe("Agent Initial Flow", () => {
  it("exports a valid compliance mastra agent", async () => {
    const complianceAgent = await getComplianceAgent();
    expect(complianceAgent).toBeDefined();
    expect(complianceAgent.name).toBe("Cerebro Compliance Agent");
  });

  it("exports a valid onboarding mastra agent", async () => {
    const onboardingAgent = await getOnboardingAgent();
    expect(onboardingAgent).toBeDefined();
    expect(onboardingAgent.name).toBe("Cerebro Onboarding Agent");
  });
});
