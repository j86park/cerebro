import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { VaultService } from "@/lib/db/vault-service";
import {
  accountTypeSchema,
  computeChecklistGaps,
  getTotalOnboardingStages,
  resolveStageChecklist,
  riskProfileSchema,
  validateDocumentDeterministic,
} from "@/lib/documents/checklist";

const inputSchema = z.object({});

const outputSchema = z.object({
  currentStage: z.number(),
  stageName: z.string(),
  stageDescription: z.string(),
  onboardingStatus: z.string(),
  accountType: z.string(),
  riskProfile: z.string().nullable(),
  requiredDocuments: z.array(
    z.object({
      type: z.string(),
      status: z.string(),
      isValid: z.boolean(),
      gapReason: z.string().nullable(),
      daysUntilExpiry: z.number().nullable(),
    }),
  ),
  gaps: z.array(
    z.object({
      documentType: z.string(),
      reason: z.string(),
      detail: z.string(),
      status: z.string(),
    }),
  ),
  completionPercentage: z.number(),
  totalStages: z.number(),
});

/**
 * Builds getOnboardingStatus with account/risk-aware checklist + gap list.
 */
export function buildGetOnboardingStatus(vault: VaultService) {
  return createTool({
    id: "getOnboardingStatus",
    description:
      "Retrieves the current onboarding status for this client, including stage checklist (account type + risk profile aware), document gaps, and completion percentage. Call this first in an onboarding run.",
    inputSchema,
    outputSchema,
    execute: async () => {
      const client = (await vault.getClientProfile()) as Record<
        string,
        unknown
      >;
      const documents = (await vault.getDocuments()) as Array<{
        type: string;
        status: string;
        expiryDate?: Date | string | null;
        uploadedAt?: Date | string | null;
      }>;

      const currentStage = client.onboardingStage as number;
      const onboardingStatus = client.onboardingStatus as string;
      const accountType = accountTypeSchema.parse(
        client.accountType ?? "INVESTMENT",
      );
      const riskProfile =
        client.riskProfile == null
          ? null
          : riskProfileSchema.parse(client.riskProfile);

      const checklistContext = {
        stage: currentStage,
        accountType,
        riskProfile,
      };
      const stageConfig = resolveStageChecklist(checklistContext);

      const stageName = stageConfig?.label ?? "Not Started";
      const stageDescription =
        stageConfig?.description ?? "Onboarding has not begun";
      const requiredDocTypes = stageConfig?.requiredDocuments ?? [];

      const requiredDocuments = requiredDocTypes.map((docType) => {
        const doc = documents.find((d) => d.type === docType);
        const validity = validateDocumentDeterministic(doc, docType);
        return {
          type: docType,
          status: validity.status,
          isValid: validity.valid,
          gapReason: validity.gapReason,
          daysUntilExpiry: validity.daysUntilExpiry,
        };
      });

      const gaps = computeChecklistGaps(checklistContext, documents);
      const totalStages = getTotalOnboardingStages();
      const completedStages = Math.max(0, currentStage - 1);
      const completionPercentage = Math.round(
        (completedStages / totalStages) * 100,
      );

      return {
        currentStage,
        stageName,
        stageDescription,
        onboardingStatus,
        accountType,
        riskProfile,
        requiredDocuments,
        gaps,
        completionPercentage,
        totalStages,
      };
    },
  });
}
