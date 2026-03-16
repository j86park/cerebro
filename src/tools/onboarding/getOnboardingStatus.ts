import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { VaultService } from "@/lib/db/vault-service";
import { ONBOARDING_STAGES } from "@/lib/documents/onboarding-stages";

const inputSchema = z.object({});

const outputSchema = z.object({
  currentStage: z.number(),
  stageName: z.string(),
  stageDescription: z.string(),
  onboardingStatus: z.string(),
  requiredDocuments: z.array(
    z.object({
      type: z.string(),
      status: z.string(),
      isValid: z.boolean(),
    })
  ),
  completionPercentage: z.number(),
  totalStages: z.number(),
});

export function buildGetOnboardingStatus(vault: VaultService) {
  return createTool({
    id: "getOnboardingStatus",
    description:
      "Retrieves the current onboarding status for this client, including which stage they are on, what documents are required, and completion percentage. Call this first in an onboarding run.",
    inputSchema,
    outputSchema,
    execute: async () => {
      const client = (await vault.getClientProfile()) as Record<
        string,
        unknown
      >;
      const documents = (await vault.getDocuments()) as Array<
        Record<string, unknown>
      >;

      const currentStage = client.onboardingStage as number;
      const onboardingStatus = client.onboardingStatus as string;
      const stageConfig = ONBOARDING_STAGES[currentStage];

      const stageName = stageConfig?.label ?? "Not Started";
      const stageDescription =
        stageConfig?.description ?? "Onboarding has not begun";
      const requiredDocTypes = stageConfig?.requiredDocuments ?? [];

      const requiredDocuments = requiredDocTypes.map((docType) => {
        const doc = documents.find((d) => d.type === docType);
        return {
          type: docType,
          status: doc ? (doc.status as string) : "MISSING",
          isValid: doc ? (doc.status as string) === "VALID" : false,
        };
      });

      const totalStages = Object.keys(ONBOARDING_STAGES).length;
      const completedStages = Math.max(0, currentStage - 1);
      const completionPercentage = Math.round(
        (completedStages / totalStages) * 100
      );

      return {
        currentStage,
        stageName,
        stageDescription,
        onboardingStatus,
        requiredDocuments,
        completionPercentage,
        totalStages,
      };
    },
  });
}
