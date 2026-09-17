import { z } from "zod";
import type { VaultService } from "@/lib/db/vault-service";
import { SHARED_TOOL_ALLOWLIST } from "@/lib/policy/toolAllowlists";
import { buildGetClientProfile } from "./getClientProfile";
import { buildGetActionHistory } from "./getActionHistory";
import { buildLogAction } from "./logAction";
import { buildSendAdvisorAlert } from "./sendAdvisorAlert";
import { buildGetOpenEscalations } from "./getOpenEscalations";
import { buildGetDocumentForReview } from "./getDocumentForReview";
import { buildGetChecklistGaps } from "./getChecklistGaps";
import { buildRefreshDocumentExtract } from "./refreshDocumentExtract";

export {
  buildGetClientProfile,
  buildGetActionHistory,
  buildLogAction,
  buildSendAdvisorAlert,
  buildGetOpenEscalations,
  buildGetDocumentForReview,
  buildGetChecklistGaps,
  buildRefreshDocumentExtract,
};

const sharedToolsOptionsSchema = z.object({
  /** Calling agent — stamped on sendAdvisorAlert ledger rows. */
  agentType: z.enum(["COMPLIANCE", "ONBOARDING"]).optional(),
});

export type BuildSharedToolsOptions = z.infer<typeof sharedToolsOptionsSchema>;

/**
 * Builds shared tools available to both agents; keys must match SHARED_TOOL_ALLOWLIST.
 */
export function buildSharedTools(
  vault: VaultService,
  options: BuildSharedToolsOptions = {},
) {
  const parsed = sharedToolsOptionsSchema.parse(options);
  const tools = {
    getClientProfile: buildGetClientProfile(vault),
    getActionHistory: buildGetActionHistory(vault),
    logAction: buildLogAction(vault),
    sendAdvisorAlert: buildSendAdvisorAlert(vault, {
      agentType: parsed.agentType,
    }),
    getOpenEscalations: buildGetOpenEscalations(vault),
    getDocumentForReview: buildGetDocumentForReview(vault),
    getChecklistGaps: buildGetChecklistGaps(vault),
    refreshDocumentExtract: buildRefreshDocumentExtract(vault),
  };
  const keys = Object.keys(tools);
  for (const name of SHARED_TOOL_ALLOWLIST) {
    if (!keys.includes(name)) {
      throw new Error(`Shared tool allowlist missing builder for "${name}"`);
    }
  }
  for (const name of keys) {
    if (!(SHARED_TOOL_ALLOWLIST as readonly string[]).includes(name)) {
      throw new Error(`Shared tool "${name}" is not on SHARED_TOOL_ALLOWLIST`);
    }
  }
  return tools;
}
