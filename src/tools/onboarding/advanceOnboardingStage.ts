import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { VaultService } from "@/lib/db/vault-service";
import { addDemoDays } from "@/lib/dates/demo-date";
import {
  accountTypeSchema,
  buildChecklistSnapshot,
  computeChecklistGaps,
  formatChecklistBlockMessage,
  getTotalOnboardingStages,
  resolveStageChecklist,
  riskProfileSchema,
} from "@/lib/documents/checklist";
import { enforceToolPolicy } from "@/lib/policy";
import { OnboardingStatus } from "@/lib/db/enums";

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
  checklistGaps: z.array(z.string()),
});

/**
 * Builds advanceOnboardingStage (stage-gated via policy matrix + checklist).
 */
export function buildAdvanceOnboardingStage(vault: VaultService) {
  return createTool({
    id: "advanceOnboardingStage",
    description:
      "Advances the client to the next onboarding stage. PREREQUISITE: All required checklist documents for the current stage (including account/risk extras) must be VALID and within DEMO_DATE expiry/recency rules.",
    inputSchema,
    outputSchema,
    execute: async (inputData) => {
      const { reasoning } = inputData;

      const client = (await vault.getClientProfile()) as Record<
        string,
        unknown
      >;
      const currentStage = client.onboardingStage as number;
      const accountType = accountTypeSchema.parse(client.accountType);
      const riskProfile =
        client.riskProfile == null
          ? null
          : riskProfileSchema.parse(client.riskProfile);

      const policy = await enforceToolPolicy({
        vault,
        domain: "onboarding",
        stage: currentStage,
        toolName: "advanceOnboardingStage",
        agentType: "ONBOARDING",
        actionType: "ADVANCE_STAGE",
        reasoning,
      });

      await vault.checkActionCooldown("ADVANCE_STAGE", 3);

      const checklistContext = {
        stage: currentStage,
        accountType,
        riskProfile,
      };
      const stageConfig = resolveStageChecklist(checklistContext);

      if (!stageConfig) {
        throw new Error(
          `Cannot advance: client is at stage ${currentStage} which has no configuration. ` +
            `Valid stages are 1-${getTotalOnboardingStages()}.`,
        );
      }

      const documents = (await vault.getDocuments()) as Array<{
        type: string;
        status: string;
        expiryDate?: Date | string | null;
        uploadedAt?: Date | string | null;
      }>;

      const gaps = computeChecklistGaps(checklistContext, documents);
      const snapshot = buildChecklistSnapshot(checklistContext, documents);

      if (gaps.length > 0) {
        const statusValues = Object.values(OnboardingStatus) as string[];
        const currentStatus = statusValues.includes(
          client.onboardingStatus as string,
        )
          ? (client.onboardingStatus as
              | "NOT_STARTED"
              | "IN_PROGRESS"
              | "COMPLETED"
              | "STALLED")
          : OnboardingStatus.IN_PROGRESS;
        // Persist gap snapshot for examiner SoR even when advance is blocked.
        await vault.upsertOnboardingStageState({
          stage: currentStage,
          status: currentStatus,
          checklistSnapshot: snapshot,
        });
        throw new Error(
          formatChecklistBlockMessage(
            currentStage,
            stageConfig.label,
            gaps,
          ),
        );
      }

      const newStage = currentStage + 1;
      await vault.upsertOnboardingStageState({
        stage: newStage,
        status: "IN_PROGRESS",
        checklistSnapshot: {
          ...snapshot,
          advancedTo: newStage,
          gaps: [],
        },
      });

      await vault.logAction({
        agentType: "ONBOARDING",
        actionType: "ADVANCE_STAGE",
        trigger: "SCHEDULED",
        reasoning,
        outcome: `ADVANCED_FROM_STAGE_${currentStage}_TO_${newStage}`,
        nextScheduledAt: addDemoDays(1),
        stage: policy.stage,
        policyVersion: policy.policyVersion,
        reasonCodes: ["POLICY_ALLOW_AUTO", "CHECKLIST_COMPLETE"],
        citedFields: {
          requiredDocuments: stageConfig.requiredDocuments,
          accountType,
          riskProfile,
        },
      });

      return {
        success: true,
        previousStage: currentStage,
        newStage,
        policyVersion: policy.policyVersion,
        checklistGaps: [],
      };
    },
  });
}
