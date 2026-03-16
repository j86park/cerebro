import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { VaultService } from "@/lib/db/vault-service";
import { env } from "@/lib/config";

const inputSchema = z.object({
  documentType: z
    .string()
    .describe("The type of document being requested (e.g. GOVERNMENT_ID)"),
  message: z
    .string()
    .describe(
      "The message to send to the client explaining what the document is and why it is needed"
    ),
  reasoning: z
    .string()
    .min(20)
    .describe("Detailed reasoning for requesting this document"),
});

const outputSchema = z.object({
  success: z.boolean(),
  dryRun: z.boolean(),
});

export function buildRequestDocument(vault: VaultService) {
  return createTool({
    id: "requestDocument",
    description:
      "Sends a document request to the client and creates/updates the document record with REQUESTED status. Used during onboarding to collect required documents stage by stage.",
    inputSchema,
    outputSchema,
    execute: async (inputData) => {
      const { documentType, message, reasoning } = inputData;
      const { DRY_RUN } = env;

      if (!DRY_RUN) {
        // TODO: Send document request email via Resend
        void message;
      }

      // Create or update document record to REQUESTED
      await vault.upsertDocument({
        type: documentType,
        category: "IDENTITY", // Will be determined by document type mapping
        status: "REQUESTED",
      });

      // Always log the action
      await vault.logAction({
        agentType: "ONBOARDING",
        actionType: "REQUEST_DOCUMENT",
        trigger: "SCHEDULED",
        reasoning,
        outcome: DRY_RUN ? "DRY_RUN" : "REQUEST_SENT",
        nextScheduledAt: new Date(
          new Date(env.DEMO_DATE).getTime() + 3 * 24 * 60 * 60 * 1000
        ),
      });

      return { success: true, dryRun: DRY_RUN };
    },
  });
}
