import { describe, expect, it, vi } from "vitest";
import { VaultService } from "@/lib/db/vault-service";
import {
  assertAgentToolAllowlist,
  assertDomainToolAllowlist,
  getAllowedToolNamesForAgent,
} from "@/lib/policy/toolAllowlists";
import { buildSharedTools } from "@/tools/shared";
import { buildComplianceTools } from "@/tools/compliance";
import { buildOnboardingTools } from "@/tools/onboarding";

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

describe("tool allowlists", () => {
  it("matches built toolsets to allowlists", () => {
    const vault = stubVault();
    const shared = Object.keys(buildSharedTools(vault));
    const compliance = Object.keys(buildComplianceTools(vault));
    const onboarding = Object.keys(buildOnboardingTools(vault));

    assertDomainToolAllowlist("compliance", compliance);
    assertDomainToolAllowlist("onboarding", onboarding);
    assertAgentToolAllowlist("compliance", [...shared, ...compliance]);
    assertAgentToolAllowlist("onboarding", [...shared, ...onboarding]);

    expect(getAllowedToolNamesForAgent("compliance").has("escalateToManagement")).toBe(
      true,
    );
    expect(getAllowedToolNamesForAgent("compliance").has("requestDocument")).toBe(
      false,
    );
    expect(getAllowedToolNamesForAgent("onboarding").has("requestDocument")).toBe(
      true,
    );
    expect(
      getAllowedToolNamesForAgent("onboarding").has("escalateToManagement"),
    ).toBe(false);
  });
});
