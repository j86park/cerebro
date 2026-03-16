import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { VaultService } from "@/lib/db/vault-service";
import { env } from "@/lib/config";

const inputSchema = z.object({
  documentId: z
    .string()
    .describe("ID of the document that was uploaded and needs validation"),
});

const outputSchema = z.object({
  valid: z.boolean(),
  documentType: z.string(),
  status: z.string(),
  notes: z.string(),
});

export function buildValidateDocumentReceived(vault: VaultService) {
  return createTool({
    id: "validateDocumentReceived",
    description:
      "Validates that an uploaded document exists in the vault and checks its current status. Does NOT auto-update the status — the agent decides what to do next based on the result.",
    inputSchema,
    outputSchema,
    execute: async (inputData) => {
      const { documentId } = inputData;

      const documents = (await vault.getDocuments()) as Array<
        Record<string, unknown>
      >;
      const doc = documents.find((d) => d.id === documentId);

      if (!doc) {
        return {
          valid: false,
          documentType: "UNKNOWN",
          status: "NOT_FOUND",
          notes: `Document ${documentId} not found in this client's vault.`,
        };
      }

      const status = doc.status as string;
      const isValid =
        status === "VALID" || status === "PENDING_REVIEW";

      // Always log the action
      await vault.logAction({
        agentType: "ONBOARDING",
        actionType: "VALIDATE_DOCUMENT",
        trigger: "EVENT_UPLOAD",
        reasoning: `Validated document ${doc.type}. Status is ${status}.`,
        outcome: isValid ? "DOCUMENT_VALID" : "DOCUMENT_INVALID",
        nextScheduledAt: new Date(new Date(env.DEMO_DATE).getTime() + 1 * 24 * 60 * 60 * 1000), // check again tomorrow if needed
      });

      return {
        valid: isValid,
        documentType: doc.type as string,
        status,
        notes: isValid
          ? `Document ${doc.type} is present with status ${status}.`
          : `Document ${doc.type} has status ${status} — may need review.`,
      };
    },
  });
}
