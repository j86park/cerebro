import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { VaultService } from "@/lib/db/vault-service";
import { env } from "@/lib/config";
import { sendTransactionalEmail } from "@/lib/email/resend";
import { enforceToolPolicy } from "@/lib/policy";

const inputSchema = z.object({
  newStage: z
    .number()
    .int()
    .min(1)
    .max(4)
    .describe("Stage the client just reached (after a successful advance)"),
  message: z
    .string()
    .min(10)
    .describe("Brief progress confirmation message for the client"),
  reasoning: z
    .string()
    .min(20)
    .describe("Why this progress notice is being sent now"),
});

const outputSchema = z.object({
  success: z.boolean(),
  dryRun: z.boolean(),
  policyVersion: z.string(),
  newStage: z.number(),
});

/**
 * Builds sendStageProgressNotice — blueprint progress confirmation after advance.
 * REGULATORY: policy-gated; DRY_RUN still writes ActionLedger.
 */
export function buildSendStageProgressNotice(vault: VaultService) {
  return createTool({
    id: "sendStageProgressNotice",
    description:
      "Sends the client a brief progress confirmation after advancing an onboarding stage. Call after a successful advanceOnboardingStage.",
    inputSchema,
    outputSchema,
    execute: async (inputData) => {
      const { newStage, message, reasoning } = inputSchema.parse(inputData);
      const { DRY_RUN } = env;

      const client = (await vault.getClientProfile()) as Record<
        string,
        unknown
      >;
      // Policy uses the stage we just left (pre-advance) when possible; fall back to current.
      const policyStage = Math.max(1, newStage - 1);

      const policy = await enforceToolPolicy({
        vault,
        domain: "onboarding",
        stage: policyStage,
        toolName: "sendStageProgressNotice",
        agentType: "ONBOARDING",
        actionType: "STAGE_PROGRESS_NOTICE",
        reasoning,
        args: { newStage },
      });

      await sendTransactionalEmail({
        to: z.string().email().parse(client.email),
        subject: `Onboarding progress: Stage ${newStage}`,
        text: message,
      });

      await vault.logAction({
        agentType: "ONBOARDING",
        actionType: "STAGE_PROGRESS_NOTICE",
        trigger: "SCHEDULED",
        reasoning,
        outcome: DRY_RUN ? "DRY_RUN" : "EMAIL_SENT",
        stage: policy.stage,
        policyVersion: policy.policyVersion,
        reasonCodes: ["POLICY_ALLOW_AUTO", "STAGE_PROGRESS_NOTICE"],
        citedFields: { newStage },
      });

      return {
        success: true,
        dryRun: DRY_RUN,
        policyVersion: policy.policyVersion,
        newStage,
      };
    },
  });
}
