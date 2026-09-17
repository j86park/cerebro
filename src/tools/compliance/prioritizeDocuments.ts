import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { VaultService } from "@/lib/db/vault-service";
import {
  getComplianceScorecard,
  rankDocumentsByUrgency,
} from "@/lib/compliance/scorecard";

const inputSchema = z.object({
  includeValid: z
    .boolean()
    .default(false)
    .describe(
      "Whether to include valid (urgency NONE) documents in the ranked list",
    ),
  limit: z
    .number()
    .int()
    .positive()
    .max(50)
    .default(20)
    .describe("Maximum number of ranked documents to return"),
});

const urgencyEnum = z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW", "NONE"]);

const prioritizedDocumentSchema = z.object({
  rank: z.number().int().positive(),
  documentId: z.string().nullable(),
  type: z.string(),
  category: z.string(),
  status: z.string(),
  daysUntilExpiry: z.number().nullable(),
  notificationCount: z.number(),
  lastNotifiedAt: z.string().nullable(),
  urgency: urgencyEnum,
  regulatoryNote: z.string(),
  isBlocker: z.boolean(),
});

const outputSchema = z.object({
  rankedDocuments: z.array(prioritizedDocumentSchema),
  topPriority: prioritizedDocumentSchema.nullable(),
  summary: z.object({
    issueCount: z.number().int().nonnegative(),
    highestUrgency: urgencyEnum,
    hasBlocker: z.boolean(),
  }),
});

/**
 * Builds prioritizeDocuments — read-only ranked multi-issue work queue.
 * REGULATORY: EXPIRED/CRITICAL before nearer EXPIRING_SOON before MISSING.
 */
export function buildPrioritizeDocuments(vault: VaultService) {
  return createTool({
    id: "prioritizeDocuments",
    description:
      "Returns vault document issues ranked by urgency for multi-issue clients. Call when getDocumentComplianceStatus shows more than one problem so you work the highest-priority document first (EXPIRED/CRITICAL → nearer expiry → MISSING).",
    inputSchema,
    outputSchema,
    execute: async (inputData) => {
      const { includeValid, limit } = inputData;
      const scorecard = await getComplianceScorecard(vault);

      const candidates = includeValid
        ? scorecard.documents
        : scorecard.documents.filter((d) => d.urgency !== "NONE");

      const ranked = rankDocumentsByUrgency(candidates).slice(0, limit);
      const topPriority = ranked[0] ?? null;

      return {
        rankedDocuments: ranked,
        topPriority,
        summary: {
          issueCount: candidates.filter((d) => d.urgency !== "NONE").length,
          highestUrgency: scorecard.summary.highestUrgency as z.infer<
            typeof urgencyEnum
          >,
          hasBlocker: scorecard.summary.hasBlocker,
        },
      };
    },
  });
}
