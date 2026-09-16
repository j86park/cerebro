import { describe, expect, it, vi } from "vitest";
import { VaultService } from "@/lib/db/vault-service";
import { buildSharedTools } from "@/tools/shared";
import { buildComplianceTools } from "@/tools/compliance";
import { buildOnboardingTools } from "@/tools/onboarding";
import {
  assertAgentToolAllowlist,
  COMPLIANCE_TOOL_ALLOWLIST,
  ONBOARDING_TOOL_ALLOWLIST,
} from "@/lib/policy/toolAllowlists";
import { buildClientMemoryScope } from "@/lib/queue/clientMemory";

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

function stubVault(): VaultService {
  const db = {
    client: {
      findUnique: vi.fn(async () => null),
      findUniqueOrThrow: vi.fn(async () => ({ id: "CLT-001" })),
      update: vi.fn(async () => ({})),
    },
    document: {
      findMany: vi.fn(async () => []),
      create: vi.fn(async () => ({})),
      update: vi.fn(async () => ({})),
      upsert: vi.fn(async () => ({})),
    },
    agentAction: {
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => null),
      create: vi.fn(async () => ({ id: "ACT-1" })),
      deleteMany: vi.fn(async () => ({})),
    },
    escalationState: {
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => null),
      upsert: vi.fn(async () => ({})),
      update: vi.fn(async () => ({})),
    },
    onboardingStage: {
      findUnique: vi.fn(async () => null),
      upsert: vi.fn(async () => ({})),
    },
  };
  return new VaultService({ clientId: "CLT-001" }, db as never);
}

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

  it("binds Mastra memory resource and thread to the vault clientId", () => {
    const scopeA = buildClientMemoryScope("CLT-001");
    const scopeB = buildClientMemoryScope("CLT-002");

    expect(scopeA).toEqual({ resource: "CLT-001", thread: "CLT-001" });
    expect(scopeB).toEqual({ resource: "CLT-002", thread: "CLT-002" });
    expect(scopeA.resource).not.toBe(scopeB.resource);
    expect(scopeA.thread).not.toBe(scopeB.thread);
  });

  it("rejects empty clientId for memory scope", () => {
    expect(() => buildClientMemoryScope("")).toThrow();
  });
});

describe("Agent tool allowlists", () => {
  it("compliance toolset includes only shared + compliance tools", () => {
    const vault = stubVault();
    const shared = buildSharedTools(vault);
    const compliance = buildComplianceTools(vault);

    expect(Object.keys(compliance).sort()).toEqual(
      [...COMPLIANCE_TOOL_ALLOWLIST].sort(),
    );
    expect(
      Object.keys(compliance).some((k) =>
        (ONBOARDING_TOOL_ALLOWLIST as readonly string[]).includes(k),
      ),
    ).toBe(false);

    expect(() =>
      assertAgentToolAllowlist("compliance", [
        ...Object.keys(shared),
        ...Object.keys(compliance),
      ]),
    ).not.toThrow();
  });

  it("onboarding toolset includes only shared + onboarding tools", () => {
    const vault = stubVault();
    const shared = buildSharedTools(vault);
    const onboarding = buildOnboardingTools(vault);

    expect(Object.keys(onboarding).sort()).toEqual(
      [...ONBOARDING_TOOL_ALLOWLIST].sort(),
    );
    expect(
      Object.keys(onboarding).some((k) =>
        (COMPLIANCE_TOOL_ALLOWLIST as readonly string[]).includes(k),
      ),
    ).toBe(false);

    expect(() =>
      assertAgentToolAllowlist("onboarding", [
        ...Object.keys(shared),
        ...Object.keys(onboarding),
      ]),
    ).not.toThrow();
  });

  it("rejects cross-domain tools on compliance allowlist", () => {
    expect(() =>
      assertAgentToolAllowlist("compliance", [
        "getClientProfile",
        "getActionHistory",
        "logAction",
        "sendAdvisorAlert",
        ...COMPLIANCE_TOOL_ALLOWLIST,
        "requestDocument",
      ]),
    ).toThrow(/Cross-domain tool "requestDocument"/);
  });
});
