import { z } from "zod";
import { env } from "@/lib/config";
import {
  getAllowedToolNamesForAgent,
  type AgentDomain,
} from "@/lib/policy/toolAllowlists";
import { listMcpCatalog } from "./catalog";
import { mcpToolDescriptorSchema, type McpToolDescriptor } from "./types";

export const mcpGuardrailDecisionSchema = z.enum([
  "allow",
  "deny",
  "require_ledger",
]);

export type McpGuardrailDecision = z.infer<typeof mcpGuardrailDecisionSchema>;

export const mcpGuardrailResultSchema = z.object({
  decision: mcpGuardrailDecisionSchema,
  reason: z.string().min(1),
  toolName: z.string().min(1),
});

export type McpGuardrailResult = z.infer<typeof mcpGuardrailResultSchema>;

const requestSchema = z.object({
  toolName: z.string().min(1),
  agentDomain: z.enum(["compliance", "onboarding"]),
  /** When true, treat as a mutate/side-effect invocation. */
  sideEffect: z.boolean().optional(),
});

/**
 * Fail-closed MCP-style guardrails over the catalog projection.
 * Deny tools outside allowlists; DRY_RUN side effects require ledger path (never silent).
 */
export function evaluateMcpGuardrail(input: {
  toolName: string;
  agentDomain: AgentDomain;
  sideEffect?: boolean;
  /** Test-only: force MCP surface on/off without mutating process.env. */
  surfaceEnabledOverride?: boolean;
}): McpGuardrailResult {
  const parsed = requestSchema.parse(input);
  const allowed = getAllowedToolNamesForAgent(parsed.agentDomain);

  if (!allowed.has(parsed.toolName)) {
    return mcpGuardrailResultSchema.parse({
      decision: "deny",
      toolName: parsed.toolName,
      reason: `Tool "${parsed.toolName}" is not in the ${parsed.agentDomain} allowlist`,
    });
  }

  const catalog = listMcpCatalog();
  const surfaceEnabled =
    input.surfaceEnabledOverride ?? catalog.surfaceEnabled;
  const descriptor: McpToolDescriptor | undefined = catalog.tools.find(
    (t) => t.name === parsed.toolName,
  );

  if (!descriptor) {
    return mcpGuardrailResultSchema.parse({
      decision: "deny",
      toolName: parsed.toolName,
      reason: `Tool "${parsed.toolName}" missing from MCP catalog projection`,
    });
  }

  const validated = mcpToolDescriptorSchema.parse(descriptor);
  const sideEffect = parsed.sideEffect ?? validated.sideEffect;

  if (!surfaceEnabled && sideEffect) {
    return mcpGuardrailResultSchema.parse({
      decision: "deny",
      toolName: parsed.toolName,
      reason:
        "MCP_INTEGRATION_SURFACE=false — side-effect tools are not exposed over MCP",
    });
  }

  if (sideEffect && env.DRY_RUN) {
    return mcpGuardrailResultSchema.parse({
      decision: "require_ledger",
      toolName: parsed.toolName,
      reason:
        "DRY_RUN=true — side-effect MCP invocations must write ActionLedger and skip externals",
    });
  }

  if (sideEffect) {
    return mcpGuardrailResultSchema.parse({
      decision: "require_ledger",
      toolName: parsed.toolName,
      reason: "Side-effect tool requires ledgered path before external send",
    });
  }

  return mcpGuardrailResultSchema.parse({
    decision: "allow",
    toolName: parsed.toolName,
    reason: "Read-only allowlisted tool",
  });
}
