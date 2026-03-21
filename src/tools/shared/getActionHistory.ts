import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { VaultService } from "@/lib/db/vault-service";

const inputSchema = z.object({
  limit: z
    .number()
    .default(20)
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
  nextScheduledAt: z.string().nullable(),
});

const outputSchema = z.object({
  actions: z.array(actionEntrySchema),
  total: z.number(),
});

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
          reasoning: a.reasoning as string,
          outcome: (a.outcome as string) ?? null,
          performedAt: String(a.performedAt),
          nextScheduledAt: a.nextScheduledAt
            ? String(a.nextScheduledAt)
            : null,
        })),
        total: allActions.length,
      };
    },
  });
}
