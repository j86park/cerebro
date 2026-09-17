import { describe, expect, it } from "vitest";
import {
  evaluateMcpGuardrail,
  isMcpIntegrationSurfaceEnabled,
  listMcpCatalog,
} from "@/lib/integrations/mcp";
import {
  COMPLIANCE_TOOL_ALLOWLIST,
  ONBOARDING_TOOL_ALLOWLIST,
  SHARED_TOOL_ALLOWLIST,
} from "@/lib/policy/toolAllowlists";

describe("MCP catalog + guardrails (SOTA P2.3 watch)", () => {
  it("defaults surface disabled", () => {
    expect(isMcpIntegrationSurfaceEnabled()).toBe(false);
  });

  it("catalog ⊆ allowlists", () => {
    const catalog = listMcpCatalog();
    const allowed = new Set<string>([
      ...SHARED_TOOL_ALLOWLIST,
      ...COMPLIANCE_TOOL_ALLOWLIST,
      ...ONBOARDING_TOOL_ALLOWLIST,
    ]);
    expect(catalog.surfaceEnabled).toBe(false);
    for (const tool of catalog.tools) {
      expect(allowed.has(tool.name)).toBe(true);
    }
    expect(catalog.tools.length).toBe(allowed.size);
  });

  it("denies tools outside allowlist", () => {
    const result = evaluateMcpGuardrail({
      toolName: "deleteVaultForever",
      agentDomain: "compliance",
    });
    expect(result.decision).toBe("deny");
  });

  it("denies side-effect tools while surface flag is off", () => {
    const result = evaluateMcpGuardrail({
      toolName: "sendClientReminder",
      agentDomain: "compliance",
      sideEffect: true,
    });
    expect(result.decision).toBe("deny");
    expect(result.reason).toMatch(/MCP_INTEGRATION_SURFACE=false/i);
  });

  it("allows read-only allowlisted tools", () => {
    const result = evaluateMcpGuardrail({
      toolName: "getDocumentComplianceStatus",
      agentDomain: "compliance",
      sideEffect: false,
    });
    expect(result.decision).toBe("allow");
  });

  it("when surface enabled, DRY_RUN side effects require ledger", () => {
    const result = evaluateMcpGuardrail({
      toolName: "sendClientReminder",
      agentDomain: "compliance",
      sideEffect: true,
      surfaceEnabledOverride: true,
    });
    expect(result.decision).toBe("require_ledger");
    expect(result.reason).toMatch(/DRY_RUN|ActionLedger/i);
  });
});
