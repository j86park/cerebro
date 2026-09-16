import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { VaultService } from "@/lib/db/vault-service";
import { env } from "@/lib/config";
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
});

/**
 * Builds requestDocument onboarding tool (stage-gated via policy matrix).
 */
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

      const client = (await vault.getClientProfile()) as Record<
        string,
        unknown
      >;
      const stage = client.onboardingStage as number;

      const policy = await enforceToolPolicy({
        vault,
        domain: "onboarding",
        stage,
        toolName: "requestDocument",
        agentType: "ONBOARDING",
        actionType: "REQUEST_DOCUMENT",
        reasoning,
        args: { documentType },
      });

      // Enforce 3-day duplicate action cooldown
      await vault.checkActionCooldown("REQUEST_DOCUMENT", 3);

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
          new Date(env.DEMO_DATE).getTime() + 3 * 24 * 60 * 60 * 1000,
        ),
        stage: policy.stage,
        policyVersion: policy.policyVersion,
        reasonCodes: ["POLICY_ALLOW_AUTO"],
      });

      return {
        success: true,
        dryRun: DRY_RUN,
        policyVersion: policy.policyVersion,
      };
    },
  });
}
