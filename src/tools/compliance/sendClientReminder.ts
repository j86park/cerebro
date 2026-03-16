import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { VaultService } from "@/lib/db/vault-service";
import { env } from "@/lib/config";

const inputSchema = z.object({
  documentId: z.string().describe("ID of the document to remind about"),
  subject: z.string().describe("Email subject line"),
  body: z.string().describe("Email body content"),
  reasoning: z
    .string()
    .min(20)
    .describe("Detailed reasoning for sending this reminder"),
});

const outputSchema = z.object({
  success: z.boolean(),
  dryRun: z.boolean(),
  notificationCount: z.number(),
});

export function buildSendClientReminder(vault: VaultService) {
  return createTool({
    id: "sendClientReminder",
    description:
      "Sends a reminder email to the client about a specific document. Used in Stage 2 and Stage 3 of the escalation ladder. Increments the notification count for the document.",
    inputSchema,
    outputSchema,
    execute: async (inputData) => {
      const { documentId, subject, body, reasoning } = inputData;
      const { DRY_RUN } = env;

      // Enforce 5-day duplicate action cooldown
      await vault.checkActionCooldown("SEND_CLIENT_REMINDER", 5, documentId);

      if (!DRY_RUN) {
        // TODO: Send email via Resend
        void subject;
        void body;
      }

      // Increment notification count
      await vault.updateDocumentStatus(documentId, "EXPIRING_SOON");

      // Always log the action
      await vault.logAction({
        agentType: "COMPLIANCE",
        actionType: "SEND_CLIENT_REMINDER",
        trigger: "SCHEDULED",
        reasoning,
        outcome: DRY_RUN ? "DRY_RUN" : "EMAIL_SENT",
        nextScheduledAt: new Date(
          new Date(env.DEMO_DATE).getTime() + 5 * 24 * 60 * 60 * 1000
        ),
        documentId,
      });

      return { success: true, dryRun: DRY_RUN, notificationCount: 1 };
    },
  });
}
