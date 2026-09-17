import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { VaultService } from "@/lib/db/vault-service";
import { sanctionsCheckResultSchema } from "@/lib/sanctions";

const inputSchema = z.object({
  subjectName: z
    .string()
    .min(1)
    .max(512)
    .optional()
    .describe(
      "Optional override of the subject name; defaults to the vault client full name",
    ),
  hitId: z
    .string()
    .min(1)
    .max(256)
    .optional()
    .describe(
      "Optional EVENT_SANCTIONS_PEP hit id from the enqueue stub (eventKey)",
    ),
  reason: z
    .string()
    .max(2_000)
    .optional()
    .describe("Why the agent is requesting a sanctions/PEP status check"),
});

const outputSchema = sanctionsCheckResultSchema.extend({
  guidance: z.string(),
});

/**
 * Builds checkSanctionsStatus — DRY_RUN-safe sanctions/PEP adapter observe tool.
 * REGULATORY: never treats adapter output as clearance; escalate when evidence is thin.
 */
export function buildCheckSanctionsStatus(vault: VaultService) {
  return createTool({
    id: "checkSanctionsStatus",
    description:
      "Runs the vault sanctions/PEP check adapter seam (default dry-run). " +
      "Returns not_checked / dry_run_skipped / vendor_unavailable only — " +
      "never invents clearance, match, or non-match. Use on EVENT_SANCTIONS_PEP " +
      "or when escalate evidence is thin; prefer escalate tools if action is required.",
    inputSchema,
    outputSchema,
    execute: async (inputData) => {
      const { subjectName: overrideName, hitId, reason } = inputData;

      let subjectName = overrideName;
      if (!subjectName) {
        const profile = (await vault.getClientProfile()) as {
          name?: string | null;
          firstName?: string | null;
          lastName?: string | null;
          fullName?: string | null;
        };
        subjectName =
          profile.name?.trim() ||
          profile.fullName?.trim() ||
          [profile.firstName, profile.lastName]
            .filter((p): p is string => Boolean(p && String(p).trim()))
            .join(" ")
            .trim() ||
          vault.getClientId();
      }

      const result = await vault.checkSanctionsPep({
        subjectName,
        hitId,
        reason,
      });

      return {
        ...result,
        guidance:
          "Adapter seam only — vendorClearanceClaimed is always false. " +
          "Do not mark the vault clear of sanctions/PEP. " +
          "If EVENT_SANCTIONS_PEP evidence is thin, escalate per the compliance ladder.",
      };
    },
  });
}
