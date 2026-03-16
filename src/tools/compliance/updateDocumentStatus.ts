import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { VaultService } from "@/lib/db/vault-service";

const inputSchema = z.object({
  documentId: z.string().describe("ID of the document to update"),
  status: z
    .enum([
      "MISSING",
      "REQUESTED",
      "PENDING_REVIEW",
      "VALID",
      "EXPIRING_SOON",
      "EXPIRED",
    ])
    .describe("New status for the document"),
  notes: z.string().optional().describe("Optional notes about the status change"),
  reasoning: z
    .string()
    .min(20)
    .describe("Detailed reasoning for updating this document's status"),
});

const outputSchema = z.object({
  success: z.boolean(),
  documentId: z.string(),
  newStatus: z.string(),
});

export function buildUpdateDocumentStatus(vault: VaultService) {
  return createTool({
    id: "updateDocumentStatus",
    description:
      "Updates the status of a specific document in the vault. Use this after validating a document or when marking it as resolved. Always logs the action.",
    inputSchema,
    outputSchema,
    execute: async (inputData) => {
      const { documentId, status, notes, reasoning } = inputData;

      await vault.updateDocumentStatus(documentId, status, notes);

      // Always log the action
      await vault.logAction({
        agentType: "COMPLIANCE",
        actionType: "MARK_RESOLVED",
        trigger: "SCHEDULED",
        reasoning,
        outcome: `STATUS_UPDATED_TO_${status}`,
        nextScheduledAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        documentId,
      });

      return { success: true, documentId, newStatus: status };
    },
  });
}
