import { z } from "zod";
import { env } from "@/lib/config";

/**
 * Structured summary shape for a future tool-as-subagent fan-out.
 * Scaffold only — not registered as a Mastra agent and not attached to toolsets.
 * REGULATORY: ActionLedger + cooldowns remain the anti-duplicate authority; summaries
 * must never authorize regulated actions.
 */
export const subagentSummarySchema = z.object({
  kind: z.enum(["tool_batch", "observation_compress"]),
  sourceToolIds: z.array(z.string().min(1)).min(1),
  summary: z.string().min(1).max(8_000),
  citations: z.array(z.string().max(500)).default([]),
  producedAt: z.string().datetime(),
});

export type SubagentSummary = z.infer<typeof subagentSummarySchema>;

export const toolAsSubagentRequestSchema = z.object({
  clientId: z.string().min(1),
  agentDomain: z.enum(["compliance", "onboarding"]),
  toolIds: z.array(z.string().min(1)).min(1).max(8),
  goal: z.string().min(1).max(2_000),
});

export type ToolAsSubagentRequest = z.infer<typeof toolAsSubagentRequestSchema>;

/**
 * Returns whether tool-as-subagent fan-out is enabled.
 * Always false until long-thread / subagent pressure is proven (T2.1 / SOTA P1.8 gate).
 * A separate env is intentionally omitted so nobody can invent a third production agent.
 */
export function isToolAsSubagentEnabled(): boolean {
  void env;
  return false;
}

/**
 * Stub entrypoint for tool-as-subagent summaries.
 * Validates input then always throws — do not call from workers or tools yet.
 *
 * @throws Error describing the unmet T2.1 gate
 */
export function runToolAsSubagentSummary(
  input: ToolAsSubagentRequest,
): SubagentSummary {
  toolAsSubagentRequestSchema.parse(input);
  throw new Error(
    "Tool-as-subagent summaries are disabled (T2.1 gate unmet). " +
      "Revisit only when Compliance/Onboarding spawn tool-as-subagent workers or " +
      "long-thread Observational Memory pressure is evidenced. " +
      "Do not invent a third production agent — keep BullMQ routing by event type.",
  );
}
