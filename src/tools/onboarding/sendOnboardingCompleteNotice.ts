import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { VaultService } from "@/lib/db/vault-service";
import { env } from "@/lib/config";
import { sendTransactionalEmail } from "@/lib/email/resend";
import { enforceToolPolicy } from "@/lib/policy";

const inputSchema = z.object({
  welcomeMessage: z
    .string()
    .min(10)
    .describe("Welcome message to send the client on onboarding completion"),
  advisorMessage: z
    .string()
    .min(10)
    .describe("Notification message for the advisor that onboarding completed"),
  reasoning: z
    .string()
    .min(20)
    .describe("Why completion notices are being sent now"),
});

const outputSchema = z.object({
  success: z.boolean(),
  dryRun: z.boolean(),
  policyVersion: z.string(),
  clientNotified: z.boolean(),
  advisorNotified: z.boolean(),
});

/**
 * Builds sendOnboardingCompleteNotice — welcome + advisor notify on complete.
 * REGULATORY: policy-gated; DRY_RUN still writes ActionLedger.
 */
export function buildSendOnboardingCompleteNotice(vault: VaultService) {
  return createTool({
    id: "sendOnboardingCompleteNotice",
    description:
      "Sends a welcome email to the client and a completion notice to the advisor after completeOnboarding succeeds.",
    inputSchema,
    outputSchema,
    execute: async (inputData) => {
      const { welcomeMessage, advisorMessage, reasoning } =
        inputSchema.parse(inputData);
      const { DRY_RUN } = env;

      const client = (await vault.getClientProfile()) as Record<
        string,
        unknown
      > & {
        advisor: { email: string };
      };

      const stage = (client.onboardingStage as number) || 4;

      const policy = await enforceToolPolicy({
        vault,
        domain: "onboarding",
        stage,
        toolName: "sendOnboardingCompleteNotice",
        agentType: "ONBOARDING",
        actionType: "ONBOARDING_COMPLETE_NOTICE",
        reasoning,
      });

      await sendTransactionalEmail({
        to: z.string().email().parse(client.email),
        subject: "Welcome — onboarding complete",
        text: welcomeMessage,
      });

      await sendTransactionalEmail({
        to: z.string().email().parse(client.advisor.email),
        subject: `Onboarding complete: ${String(client.name ?? client.id)}`,
        text: advisorMessage,
      });

      await vault.logAction({
        agentType: "ONBOARDING",
        actionType: "ONBOARDING_COMPLETE_NOTICE",
        trigger: "SCHEDULED",
        reasoning,
        outcome: DRY_RUN ? "DRY_RUN" : "EMAIL_SENT",
        stage: policy.stage,
        policyVersion: policy.policyVersion,
        reasonCodes: ["POLICY_ALLOW_AUTO", "ONBOARDING_COMPLETE_NOTICE"],
        citedFields: { clientNotified: true, advisorNotified: true },
      });

      return {
        success: true,
        dryRun: DRY_RUN,
        policyVersion: policy.policyVersion,
        clientNotified: true,
        advisorNotified: true,
      };
    },
  });
}
