import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { VaultService } from "@/lib/db/vault-service";
import {
  accountTypeSchema,
  checklistGapSchema,
  computeChecklistGaps,
  resolveStageChecklist,
  riskProfileSchema,
} from "@/lib/documents/checklist";

const inputSchema = z.object({
  stage: z
    .number()
    .int()
    .min(0)
    .max(4)
    .optional()
    .describe(
      "Optional stage override; defaults to the client's current onboarding stage",
    ),
});

const outputSchema = z.object({
  stage: z.number().int(),
  stageName: z.string(),
  accountType: z.string(),
  riskProfile: riskProfileSchema.nullable(),
  requiredDocuments: z.array(z.string()),
  gaps: z.array(checklistGapSchema),
  gapCount: z.number().int().nonnegative(),
});

/**
 * Builds getChecklistGaps — explicit checklist gap DTO for both agents.
 * Reduces reasoning from prose status tools alone.
 */
export function buildGetChecklistGaps(vault: VaultService) {
  return createTool({
    id: "getChecklistGaps",
    description:
      "Returns machine-readable onboarding checklist gaps for the current (or overridden) stage, account type, and risk profile. Use when deciding which documents to request or validate.",
    inputSchema,
    outputSchema,
    execute: async (inputData) => {
      const parsed = inputSchema.parse(inputData);
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

      const stage = parsed.stage ?? (client.onboardingStage as number);
      const accountType = accountTypeSchema.parse(
        client.accountType ?? "INVESTMENT",
      );
      const riskProfile =
        client.riskProfile == null
          ? null
          : riskProfileSchema.parse(client.riskProfile);

      const checklistContext = { stage, accountType, riskProfile };
      const stageConfig = resolveStageChecklist(checklistContext);
      const gaps = computeChecklistGaps(checklistContext, documents);

      return {
        stage,
        stageName: stageConfig?.label ?? "Not Started",
        accountType,
        riskProfile,
        requiredDocuments: stageConfig?.requiredDocuments ?? [],
        gaps,
        gapCount: gaps.length,
      };
    },
  });
}
