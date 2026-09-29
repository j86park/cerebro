import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { VaultService } from "@/lib/db/vault-service";
import { resolveComplianceLadderStage } from "@/lib/policy";

const inputSchema = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(12)
    .default(6)
    .describe("Maximum number of recent actions to return"),
});

const actionEntrySchema = z.object({
  id: z.string(),
  agentType: z.string(),
  actionType: z.string(),
  trigger: z.string(),
  reasoning: z.string(),
  outcome: z.string().nullable(),
  performedAt: z.string(),
  effectiveAt: z.string(),
  nextScheduledAt: z.string().nullable(),
});

const outputSchema = z.object({
  actions: z.array(actionEntrySchema),
  total: z.number(),
  complianceLadderStage: z.number().int(),
  approvedEscalationStages: z.array(z.number().int()),
});

function utcTimestamp(value: unknown): string {
  return new Date(value as string | Date).toISOString();
}

export function buildGetActionHistory(vault: VaultService) {
  return createTool({
    id: "getActionHistory",
    description:
      "Retrieves the action history for this client, newest first. Always call this BEFORE taking any action to understand what has already been done.",
    inputSchema,
    outputSchema,
    execute: async (inputData) => {
      const { limit } = inputData;
      const allActions = (await vault.getActionHistory()) as Array<
        Record<string, unknown>
      >;
      const sliced = allActions.slice(0, limit);
      return {
        actions: sliced.map((a) => ({
          id: a.id as string,
          agentType: a.agentType as string,
          actionType: a.actionType as string,
          trigger: a.trigger as string,
          reasoning: String(a.reasoning ?? "").slice(0, 200),
          outcome: (a.outcome as string) ?? null,
          performedAt: utcTimestamp(a.performedAt),
          effectiveAt: utcTimestamp(a.effectiveAt ?? a.performedAt),
          nextScheduledAt: a.nextScheduledAt
            ? utcTimestamp(a.nextScheduledAt)
            : null,
        })),
        total: allActions.length,
        complianceLadderStage: resolveComplianceLadderStage(allActions.map((action) => ({
          actionType: String(action.actionType), outcome: action.outcome == null ? null : String(action.outcome),
        }))),
        approvedEscalationStages: [...new Set(allActions.filter((action) =>
          action.actor === "ADVISOR" && Array.isArray(action.reasonCodes)
          && action.reasonCodes.includes("HITL_APPROVED") && typeof action.stage === "number",
        ).map((action) => action.stage as number))],
      };
    },
  });
}
