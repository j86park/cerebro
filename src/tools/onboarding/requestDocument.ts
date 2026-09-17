import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { VaultService } from "@/lib/db/vault-service";
import { env } from "@/lib/config";
import { addDemoDays } from "@/lib/dates/demo-date";
import { sendTransactionalEmail } from "@/lib/email/resend";
import {
  accountTypeSchema,
  categoryForDocumentType,
  documentTypeSchema,
  isDocumentOnStageChecklist,
  riskProfileSchema,
} from "@/lib/documents/checklist";
import { enforceToolPolicy } from "@/lib/policy";

const inputSchema = z.object({
  documentType: z
    .string()
    .describe("The type of document being requested (e.g. GOVERNMENT_ID)"),
  message: z
    .string()
    .describe(
      "The message to send to the client explaining what the document is and why it is needed",
    ),
  reasoning: z
    .string()
    .min(20)
    .describe("Detailed reasoning for requesting this document"),
});

const outputSchema = z.object({
  success: z.boolean(),
  dryRun: z.boolean(),
  policyVersion: z.string(),
  onChecklist: z.boolean(),
});

/**
 * Builds requestDocument — gap-driven follow-up gated by policy matrix.
 */
export function buildRequestDocument(vault: VaultService) {
  return createTool({
    id: "requestDocument",
    description:
      "Sends a document request to the client and creates/updates the document record with REQUESTED status. Prefer requesting documents that appear as checklist gaps for the current stage.",
    inputSchema,
    outputSchema,
    execute: async (inputData) => {
      const { documentType, message, reasoning } = inputData;
      const { DRY_RUN } = env;

      const parsedType = documentTypeSchema.parse(documentType);

      const client = (await vault.getClientProfile()) as Record<
        string,
        unknown
      >;
      const stage = client.onboardingStage as number;
      const accountType = accountTypeSchema.parse(client.accountType);
      const riskProfile =
        client.riskProfile == null
          ? null
          : riskProfileSchema.parse(client.riskProfile);

      const policy = await enforceToolPolicy({
        vault,
        domain: "onboarding",
        stage,
        toolName: "requestDocument",
        agentType: "ONBOARDING",
        actionType: "REQUEST_DOCUMENT",
        reasoning,
        args: { documentType: parsedType },
      });

      await vault.checkActionCooldown("REQUEST_DOCUMENT", 3);

      const onChecklist = isDocumentOnStageChecklist(
        { stage, accountType, riskProfile },
        parsedType,
      );

      await sendTransactionalEmail({
        to: z.string().email().parse(client.email),
        subject: `Document request: ${parsedType}`,
        text: message,
      });

      await vault.upsertDocument({
        type: parsedType,
        category: categoryForDocumentType(parsedType),
        status: "REQUESTED",
      });

      await vault.logAction({
        agentType: "ONBOARDING",
        actionType: "REQUEST_DOCUMENT",
        trigger: "SCHEDULED",
        reasoning,
        outcome: DRY_RUN ? "DRY_RUN" : "REQUEST_SENT",
        nextScheduledAt: addDemoDays(3),
        stage: policy.stage,
        policyVersion: policy.policyVersion,
        reasonCodes: onChecklist
          ? ["POLICY_ALLOW_AUTO", "CHECKLIST_GAP_FOLLOWUP"]
          : ["POLICY_ALLOW_AUTO", "OFF_CHECKLIST_REQUEST"],
        citedFields: { documentType: parsedType, onChecklist },
      });

      return {
        success: true,
        dryRun: DRY_RUN,
        policyVersion: policy.policyVersion,
        onChecklist,
      };
    },
  });
}
