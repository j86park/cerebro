import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { VaultService } from "@/lib/db/vault-service";
import { riskProfileSchema } from "@/lib/documents/checklist";

const inputSchema = z.object({});

const outputSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  accountType: z.string(),
  /** Null when unset — onboarding checklist treats null as no aggressive extras. */
  riskProfile: riskProfileSchema.nullable(),
  onboardingStatus: z.string(),
  onboardingStage: z.number(),
  advisor: z.object({
    name: z.string(),
    email: z.string(),
  }),
  firm: z.object({
    name: z.string(),
  }),
});

/**
 * Builds getClientProfile including riskProfile for checklist-correct decisions.
 */
export function buildGetClientProfile(vault: VaultService) {
  return createTool({
    id: "getClientProfile",
    description:
      "Retrieves the full client profile for this vault including advisor, firm, account type, and risk profile. Call this to understand who the client is.",
    inputSchema,
    outputSchema,
    execute: async () => {
      const client = (await vault.getClientProfile()) as Record<
        string,
        unknown
      > & {
        advisor: Record<string, unknown>;
        firm: Record<string, unknown>;
      };

      const riskRaw = client.riskProfile;
      const riskProfile =
        riskRaw == null || riskRaw === ""
          ? null
          : riskProfileSchema.parse(riskRaw);

      return {
        id: client.id as string,
        name: client.name as string,
        email: client.email as string,
        accountType: client.accountType as string,
        riskProfile,
        onboardingStatus: client.onboardingStatus as string,
        onboardingStage: client.onboardingStage as number,
        advisor: {
          name: client.advisor.name as string,
          email: client.advisor.email as string,
        },
        firm: {
          name: client.firm.name as string,
        },
      };
    },
  });
}
