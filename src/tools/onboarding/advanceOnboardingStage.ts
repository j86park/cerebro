import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { VaultService } from "@/lib/db/vault-service";
import { ONBOARDING_STAGES } from "@/lib/documents/onboarding-stages";
import { env } from "@/lib/config";
import { enforceToolPolicy } from "@/lib/policy";

const inputSchema = z.object({
  reasoning: z
    .string()
    .min(20)
    .describe(
      "Detailed reasoning for advancing the onboarding stage, including confirmation that all required documents are validated",
    ),
});

const outputSchema = z.object({
  success: z.boolean(),
  previousStage: z.number(),
  newStage: z.number(),
  policyVersion: z.string(),
});

/**
 * Builds advanceOnboardingStage (stage-gated via policy matrix).
 */
export function buildAdvanceOnboardingStage(vault: VaultService) {
  return createTool({
    id: "advanceOnboardingStage",
    description:
      "Advances the client to the next onboarding stage. PREREQUISITE: All required documents for the current stage must have VALID status. The tool self-enforces this check.",
    inputSchema,
    outputSchema,
    execute: async (inputData) => {
      const { reasoning } = inputData;

      const client = (await vault.getClientProfile()) as Record<
        string,
        unknown
      >;
      const currentStage = client.onboardingStage as number;

      const policy = await enforceToolPolicy({
        vault,
        domain: "onboarding",
        stage: currentStage,
        toolName: "advanceOnboardingStage",
        agentType: "ONBOARDING",
        actionType: "ADVANCE_STAGE",
        reasoning,
      });

      // Enforce 3-day duplicate action cooldown (prevent double-advancing too quickly)
      await vault.checkActionCooldown("ADVANCE_STAGE", 3);

      const stageConfig = ONBOARDING_STAGES[currentStage];

      if (!stageConfig) {
        throw new Error(
          `Cannot advance: client is at stage ${currentStage} which has no configuration. ` +
            `Valid stages are 1-${Object.keys(ONBOARDING_STAGES).length}.`,
        );
      }

      // Self-enforce prerequisite: all required documents must be VALID
      const documents = (await vault.getDocuments()) as Array<
        Record<string, unknown>
      >;

      const missingOrInvalid = stageConfig.requiredDocuments.filter(
        (docType) => {
          const doc = documents.find((d) => d.type === docType);
          return !doc || (doc.status as string) !== "VALID";
        },
      );

      if (missingOrInvalid.length > 0) {
        throw new Error(
          `Cannot advance stage: the following documents are not yet VALID: ${missingOrInvalid.join(", ")}. ` +
            `All required documents for Stage ${currentStage} (${stageConfig.label}) must have VALID status.`,
        );
      }

      const newStage = currentStage + 1;
      await vault.resetOnboarding(newStage, "IN_PROGRESS");

      // Always log the action
      await vault.logAction({
        agentType: "ONBOARDING",
        actionType: "ADVANCE_STAGE",
        trigger: "SCHEDULED",
        reasoning,
        outcome: `ADVANCED_FROM_STAGE_${currentStage}_TO_${newStage}`,
        nextScheduledAt: new Date(
          new Date(env.DEMO_DATE).getTime() + 1 * 24 * 60 * 60 * 1000,
        ),
        stage: policy.stage,
        policyVersion: policy.policyVersion,
        reasonCodes: ["POLICY_ALLOW_AUTO"],
      });

      return {
        success: true,
        previousStage: currentStage,
        newStage,
        policyVersion: policy.policyVersion,
      };
    },
  });
}
