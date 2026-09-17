import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { VaultService } from "@/lib/db/vault-service";
import { addDemoDays } from "@/lib/dates/demo-date";

/** Statuses that close an open compliance issue — use markResolved instead. */
const resolveClassStatuses = ["VALID"] as const;

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
    .describe(
      "New status for the document. Prefer markResolved when setting VALID to close an issue.",
    ),
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
  usedResolvePath: z.boolean(),
});

/**
 * Builds updateDocumentStatus for general vault status mutations.
 * Resolve-class (VALID) updates still log MARK_RESOLVED for ledger/eval parity;
 * prefer the dedicated markResolved tool when closing an issue after upload.
 */
export function buildUpdateDocumentStatus(vault: VaultService) {
  return createTool({
    id: "updateDocumentStatus",
    description:
      "Updates a document's vault status. For closing a resolved compliance issue (VALID), prefer markResolved. Always logs the action.",
    inputSchema,
    outputSchema,
    execute: async (inputData) => {
      const { documentId, status, notes, reasoning } = inputData;
      const usedResolvePath = (
        resolveClassStatuses as readonly string[]
      ).includes(status);

      if (usedResolvePath) {
        // REGULATORY: same 5-day no-repeat window as markResolved for VALID writes.
        await vault.checkActionCooldown("MARK_RESOLVED", 5, documentId);
      }

      await vault.updateDocumentStatus(documentId, status, notes);

      await vault.logAction({
        agentType: "COMPLIANCE",
        // Ledger only has MARK_RESOLVED for resolve-class; non-resolve still stamps
        // MARK_RESOLVED with an explicit STATUS_UPDATED_TO_* outcome for audit.
        actionType: "MARK_RESOLVED",
        trigger: "SCHEDULED",
        reasoning,
        outcome: `STATUS_UPDATED_TO_${status}`,
        nextScheduledAt: addDemoDays(7),
        documentId,
        reasonCodes: usedResolvePath
          ? ["MARK_RESOLVED"]
          : ["STATUS_UPDATE_NON_RESOLVE"],
      });

      return {
        success: true,
        documentId,
        newStatus: status,
        usedResolvePath,
      };
    },
  });
}
