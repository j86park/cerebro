import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { VaultService } from "@/lib/db/vault-service";
import { getComplianceScorecard } from "@/lib/compliance/scorecard";

const inputSchema = z.object({
  includeValid: z
    .boolean()
    .default(false)
    .describe(
      "Whether to include valid documents in the response or only problem documents"
    ),
});

const urgencyEnum = z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW", "NONE"]);

const outputSchema = z.object({
  documents: z.array(
    z.object({
      documentId: z.string().nullable(),
      type: z.string(),
      category: z.string(),
      status: z.string(),
      daysUntilExpiry: z.number().nullable(),
      notificationCount: z.number(),
      lastNotifiedAt: z.string().nullable(),
      urgency: urgencyEnum,
      regulatoryNote: z.string(),
      isBlocker: z.boolean().default(false),
    })
  ),
  summary: z.object({
    totalDocuments: z.number(),
    expiredCount: z.number(),
    expiringSoonCount: z.number(),
    missingCount: z.number(),
    highestUrgency: urgencyEnum,
    hasBlocker: z.boolean(),
  }),
});

export function buildGetDocumentComplianceStatus(vault: VaultService) {
  return createTool({
    id: "getDocumentComplianceStatus",
    description:
      "Retrieves the compliance status of all documents in this client's vault, including missing requirements based on account type. Returns urgency levels and indicates blockers. Always call this first in a compliance run.",
    inputSchema,
    outputSchema,
    execute: async (inputData) => {
      const { includeValid } = inputData;
      const scorecard = await getComplianceScorecard(vault);

      const filtered = includeValid
        ? scorecard.documents
        : scorecard.documents.filter((d) => d.urgency !== "NONE");

      return {
        documents: filtered,
        summary: {
          ...scorecard.summary,
          highestUrgency: scorecard.summary.highestUrgency as z.infer<typeof urgencyEnum>,
        },
      };
    },
  });
}
