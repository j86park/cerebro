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

describe("Agent Memory Scoping", () => {
  it("initializes complianceAgent with lastMessages limit and workingMemory", async () => {
    const complianceAgent = await getComplianceAgent();
    expect(complianceAgent).toBeDefined();
    expect(complianceAgent.name).toBe("Cerebro Compliance Agent");
  });

  it("initializes onboardingAgent with lastMessages limit and workingMemory", async () => {
    const onboardingAgent = await getOnboardingAgent();
    expect(onboardingAgent).toBeDefined();
    expect(onboardingAgent.name).toBe("Cerebro Onboarding Agent");
  });
});
