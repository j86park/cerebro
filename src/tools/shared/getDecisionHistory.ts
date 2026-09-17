import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { VaultService } from "@/lib/db/vault-service";

const inputSchema = z.object({
  limit: z
    .number()
    .int()
    .positive()
    .max(100)
    .default(20)
    .describe("Maximum number of recent decision records to return"),
  jobId: z
    .string()
    .min(1)
    .optional()
    .describe("Optional BullMQ job id to filter examiner DecisionRecords"),
});

const decisionEntrySchema = z.object({
  id: z.string(),
  jobId: z.string(),
  agentName: z.string(),
  stage: z.number().nullable(),
  traceId: z.string(),
  policyVersion: z.string().nullable(),
  policyFired: z.string().nullable(),
  toolProposed: z.array(z.string()),
  toolExecuted: z.array(z.string()),
  refusalCodes: z.array(z.string()),
  reviewer: z.string().nullable(),
  outcome: z.string(),
  reason: z.string(),
  promptVersionId: z.string().nullable(),
  contentCaptured: z.boolean(),
  decidedAt: z.string(),
});

const outputSchema = z.object({
  decisions: z.array(decisionEntrySchema),
  total: z.number().int().nonnegative(),
});

/**
 * Builds getDecisionHistory — read-only examiner DecisionRecord observe tool.
 * Prefer ActionLedger (`getActionHistory`) for action SoR; use this for run/job
 * outcome self-audit only. Does not expose metadata payloads.
 */
export function buildGetDecisionHistory(vault: VaultService) {
  return createTool({
    id: "getDecisionHistory",
    description:
      "Lists recent examiner DecisionRecords for this client (run started/succeeded/failed, dry-run, online-judged). Use for self-audit of prior job outcomes; prefer getActionHistory for the durable action ledger.",
    inputSchema,
    outputSchema,
    execute: async (inputData) => {
      const { limit, jobId } = inputData;
      const rows = (await vault.getDecisionHistory(
        jobId ? { jobId } : undefined,
      )) as Array<Record<string, unknown>>;

      // VaultService returns decidedAt ascending; agents want newest first.
      const newestFirst = [...rows].reverse();
      const sliced = newestFirst.slice(0, limit);

      return {
        decisions: sliced.map((row) => {
          const decidedAt = row.decidedAt;
          return {
            id: String(row.id),
            jobId: String(row.jobId),
            agentName: String(row.agentName),
            stage:
              typeof row.stage === "number"
                ? row.stage
                : row.stage === null || row.stage === undefined
                  ? null
                  : Number(row.stage),
            traceId: String(row.traceId),
            policyVersion:
              row.policyVersion === null || row.policyVersion === undefined
                ? null
                : String(row.policyVersion),
            policyFired:
              row.policyFired === null || row.policyFired === undefined
                ? null
                : String(row.policyFired),
            toolProposed: Array.isArray(row.toolProposed)
              ? row.toolProposed.map(String)
              : [],
            toolExecuted: Array.isArray(row.toolExecuted)
              ? row.toolExecuted.map(String)
              : [],
            refusalCodes: Array.isArray(row.refusalCodes)
              ? row.refusalCodes.map(String)
              : [],
            reviewer:
              row.reviewer === null || row.reviewer === undefined
                ? null
                : String(row.reviewer),
            outcome: String(row.outcome),
            reason: String(row.reason),
            promptVersionId:
              row.promptVersionId === null || row.promptVersionId === undefined
                ? null
                : String(row.promptVersionId),
            contentCaptured: Boolean(row.contentCaptured),
            decidedAt:
              decidedAt instanceof Date
                ? decidedAt.toISOString()
                : String(decidedAt),
          };
        }),
        total: rows.length,
      };
    },
  });
}
