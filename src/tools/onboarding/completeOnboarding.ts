import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { VaultService } from "@/lib/db/vault-service";
import { addDemoDays, demoNow } from "@/lib/dates/demo-date";
import {
  accountTypeSchema,
  computeChecklistGaps,
  getTotalOnboardingStages,
  resolveStageChecklist,
  riskProfileSchema,
} from "@/lib/documents/checklist";
import { enforceToolPolicy } from "@/lib/policy";

const inputSchema = z.object({
  reasoning: z
    .string()
    .min(20)
    .describe(
      "Detailed reasoning for completing onboarding, confirming all stages and documents are verified",
    ),
});

const outputSchema = z.object({
  success: z.boolean(),
  completedAt: z.string(),
  policyVersion: z.string(),
});

/**
 * Builds completeOnboarding (stage-gated via policy matrix + final checklist).
 */
export function buildCompleteOnboarding(vault: VaultService) {
  return createTool({
    id: "completeOnboarding",
    description:
      "Marks the client's onboarding as fully complete. PREREQUISITE: Client must be at the final stage and all final-stage checklist documents (account/risk aware) must be VALID under DEMO_DATE rules.",
    inputSchema,
    outputSchema,
    execute: async (inputData) => {
      const { reasoning } = inputData;

      const client = (await vault.getClientProfile()) as Record<
        string,
        unknown
      >;
      const currentStage = client.onboardingStage as number;
      const totalStages = getTotalOnboardingStages();
      const accountType = accountTypeSchema.parse(client.accountType);
      const riskProfile =
        client.riskProfile == null
          ? null
          : riskProfileSchema.parse(client.riskProfile);

      const policy = await enforceToolPolicy({
        vault,
        domain: "onboarding",
        stage: currentStage,
        toolName: "completeOnboarding",
        agentType: "ONBOARDING",
        actionType: "COMPLETE_ONBOARDING",
        reasoning,
      });

      if (currentStage < totalStages) {
        throw new Error(
          `Cannot complete onboarding: client is at stage ${currentStage} but must be at stage ${totalStages}. ` +
            `Advance through all stages first.`,
        );
      }

      const checklistContext = {
        stage: totalStages,
        accountType,
        riskProfile,
      };
      const stageConfig = resolveStageChecklist(checklistContext);
      const documents = (await vault.getDocuments()) as Array<{
        type: string;
        status: string;
        expiryDate?: Date | string | null;
        uploadedAt?: Date | string | null;
      }>;

      const gaps = computeChecklistGaps(checklistContext, documents);
      if (gaps.length > 0) {
        const parts = gaps.map(
          (g) => `${g.documentType} (${g.reason}: ${g.status})`,
        );
        throw new Error(
          `Cannot complete onboarding: Stage ${totalStages} checklist incomplete. Gaps: ${parts.join("; ")}.`,
        );
      }

      await vault.upsertOnboardingStageState({
        stage: totalStages,
        status: "COMPLETED",
        checklistSnapshot: {
          stage: totalStages,
          accountType,
          riskProfile,
          requiredDocuments: stageConfig?.requiredDocuments ?? [],
          gaps: [],
          completedAt: demoNow().toISOString(),
        },
      });

      const completedAt = demoNow().toISOString();

      await vault.logAction({
        agentType: "ONBOARDING",
        actionType: "COMPLETE_ONBOARDING",
        trigger: "SCHEDULED",
        reasoning,
        outcome: "ONBOARDING_COMPLETED",
        nextScheduledAt: addDemoDays(30),
        stage: policy.stage,
        policyVersion: policy.policyVersion,
        reasonCodes: ["POLICY_ALLOW_AUTO", "CHECKLIST_COMPLETE"],
      });

      return {
        success: true,
        completedAt,
        policyVersion: policy.policyVersion,
      };
    },
  });
}
