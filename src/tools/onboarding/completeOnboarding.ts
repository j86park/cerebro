import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { VaultService } from "@/lib/db/vault-service";
import { ONBOARDING_STAGES } from "@/lib/documents/onboarding-stages";

const inputSchema = z.object({
  reasoning: z
    .string()
    .min(20)
    .describe(
      "Detailed reasoning for completing onboarding, confirming all stages and documents are verified"
    ),
});

const outputSchema = z.object({
  success: z.boolean(),
  completedAt: z.string(),
});

export function buildCompleteOnboarding(vault: VaultService) {
  return createTool({
    id: "completeOnboarding",
    description:
      "Marks the client's onboarding as fully complete. PREREQUISITE: Client must be at the final stage and all Stage 4 documents must have VALID status.",
    inputSchema,
    outputSchema,
    execute: async (inputData) => {
      const { reasoning } = inputData;

      const client = (await vault.getClientProfile()) as Record<
        string,
        unknown
      >;
      const currentStage = client.onboardingStage as number;
      const totalStages = Object.keys(ONBOARDING_STAGES).length;

      if (currentStage < totalStages) {
        throw new Error(
          `Cannot complete onboarding: client is at stage ${currentStage} but must be at stage ${totalStages}. ` +
            `Advance through all stages first.`
        );
      }

      // Self-enforce: all final stage documents must be VALID
      const stageConfig = ONBOARDING_STAGES[totalStages];
      if (stageConfig) {
        const documents = (await vault.getDocuments()) as Array<
          Record<string, unknown>
        >;

        const missingOrInvalid = stageConfig.requiredDocuments.filter(
          (docType) => {
            const doc = documents.find((d) => d.type === docType);
            return !doc || (doc.status as string) !== "VALID";
          }
        );

        if (missingOrInvalid.length > 0) {
          throw new Error(
            `Cannot complete onboarding: the following Stage ${totalStages} documents are not VALID: ${missingOrInvalid.join(", ")}.`
          );
        }
      }

      await vault.resetOnboarding(totalStages, "COMPLETED");

      const completedAt = new Date().toISOString();

      // Always log the action
      await vault.logAction({
        agentType: "ONBOARDING",
        actionType: "COMPLETE_ONBOARDING",
        trigger: "SCHEDULED",
        reasoning,
        outcome: "ONBOARDING_COMPLETED",
        nextScheduledAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      return { success: true, completedAt };
    },
  });
}
