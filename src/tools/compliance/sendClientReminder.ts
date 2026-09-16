import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { VaultService } from "@/lib/db/vault-service";
import { env } from "@/lib/config";
import { sendTransactionalEmail } from "@/lib/email/resend";
import {
  enforceToolPolicy,
  resolveComplianceLadderStage,
} from "@/lib/policy";

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
  policyVersion: z.string(),
});

/**
 * Builds the sendClientReminder compliance tool (stage-gated via policy matrix).
 */
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

      const history = (await vault.getActionHistory()) as Array<{
        actionType: string;
      }>;
      const stage = resolveComplianceLadderStage(history);

      const policy = await enforceToolPolicy({
        vault,
        domain: "compliance",
        stage,
        toolName: "sendClientReminder",
        agentType: "COMPLIANCE",
        actionType: "SEND_CLIENT_REMINDER",
        reasoning,
        documentId,
        args: { documentId, subject },
      });

      // Enforce 5-day duplicate action cooldown
      await vault.checkActionCooldown("SEND_CLIENT_REMINDER", 5, documentId);

      const profile = (await vault.getClientProfile()) as { email: string };
      await sendTransactionalEmail({
        to: profile.email,
        subject,
        text: body,
      });

      // Increment notification count
      await vault.updateDocumentStatus(documentId, "EXPIRING_SOON");

      // Always log the action (DRY_RUN still writes ledger)
      await vault.logAction({
        agentType: "COMPLIANCE",
        actionType: "SEND_CLIENT_REMINDER",
        trigger: "SCHEDULED",
        reasoning,
        outcome: DRY_RUN ? "DRY_RUN" : "EMAIL_SENT",
        nextScheduledAt: new Date(
          new Date(env.DEMO_DATE).getTime() + 5 * 24 * 60 * 60 * 1000,
        ),
        documentId,
        stage: policy.stage,
        policyVersion: policy.policyVersion,
        reasonCodes: ["POLICY_ALLOW_AUTO"],
      });

      return {
        success: true,
        dryRun: DRY_RUN,
        notificationCount: 1,
        policyVersion: policy.policyVersion,
      };
    },
  });
}
