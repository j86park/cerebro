import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { VaultService } from "@/lib/db/vault-service";
import { addDemoDays } from "@/lib/dates/demo-date";

/** Statuses onboarding may write without borrowing the compliance toolset. */
const onboardingWritableStatusSchema = z.enum([
  "REQUESTED",
  "PENDING_REVIEW",
]);

const inputSchema = z.object({
  documentId: z.string().describe("ID of the document to update"),
  status: onboardingWritableStatusSchema.describe(
    "New onboarding-writable status (REQUESTED or PENDING_REVIEW)",
  ),
  notes: z.string().optional().describe("Optional notes about the status change"),
  reasoning: z
    .string()
    .min(20)
    .describe("Detailed reasoning for this onboarding status write"),
});

const outputSchema = z.object({
  success: z.boolean(),
  documentId: z.string(),
  newStatus: onboardingWritableStatusSchema,
});

/**
 * Builds onboarding-only setDocumentStatus (REQUESTED / PENDING_REVIEW).
 * Only validateDocumentReceived may admit an upload as VALID.
 */
export function buildSetDocumentStatus(vault: VaultService) {
  return createTool({
    id: "setDocumentStatus",
    description:
      "Sets an onboarding document status to REQUESTED or PENDING_REVIEW. Use validateDocumentReceived to admit an upload as VALID.",
    inputSchema,
    outputSchema,
    execute: async (inputData) => {
      const { documentId, status, notes, reasoning } = inputData;

      await vault.updateDocumentStatus(documentId, status, notes);

      await vault.logAction({
        agentType: "ONBOARDING",
        actionType: "REQUEST_DOCUMENT",
        trigger: "SCHEDULED",
        reasoning,
        outcome: `STATUS_UPDATED_TO_${status}`,
        nextScheduledAt: addDemoDays(3, vault.getNow()),
        documentId,
        reasonCodes: ["ONBOARDING_STATUS_WRITE"],
        citedFields: { newStatus: status },
      });

      return { success: true, documentId, newStatus: status };
    },
  });
}
