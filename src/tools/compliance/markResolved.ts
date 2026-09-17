import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { VaultService } from "@/lib/db/vault-service";
import { addDemoDays } from "@/lib/dates/demo-date";

const inputSchema = z.object({
  documentId: z.string().describe("ID of the document that resolves the issue"),
  notes: z
    .string()
    .optional()
    .describe("Optional notes about how the upload cleared the issue"),
  reasoning: z
    .string()
    .min(20)
    .describe(
      "Detailed reasoning for marking this document resolved (why the issue is closed)",
    ),
});

const outputSchema = z.object({
  success: z.boolean(),
  documentId: z.string(),
  newStatus: z.literal("VALID"),
});

/**
 * Builds markResolved — resolve-class status write that only sets VALID.
 * Prefer this over updateDocumentStatus when closing a compliance issue after upload.
 */
export function buildMarkResolved(vault: VaultService) {
  return createTool({
    id: "markResolved",
    description:
      "Marks a document as VALID after an upload clears a compliance issue. Prefer this over updateDocumentStatus when resolving. Always logs MARK_RESOLVED.",
    inputSchema,
    outputSchema,
    execute: async (inputData) => {
      const { documentId, notes, reasoning } = inputData;

      // REGULATORY: avoid duplicate resolve noise within the 5-day no-repeat window.
      await vault.checkActionCooldown("MARK_RESOLVED", 5, documentId);

      await vault.updateDocumentStatus(documentId, "VALID", notes);

      await vault.logAction({
        agentType: "COMPLIANCE",
        actionType: "MARK_RESOLVED",
        trigger: "EVENT_UPLOAD",
        reasoning,
        outcome: "STATUS_UPDATED_TO_VALID",
        nextScheduledAt: addDemoDays(7),
        documentId,
        reasonCodes: ["MARK_RESOLVED"],
      });

      return { success: true, documentId, newStatus: "VALID" as const };
    },
  });
}
