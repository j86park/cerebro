import type { VaultService } from "@/lib/db/vault-service";
import { buildGetClientProfile } from "./getClientProfile";
import { buildGetActionHistory } from "./getActionHistory";
import { buildLogAction } from "./logAction";
import { buildSendAdvisorAlert } from "./sendAdvisorAlert";

export {
  buildGetClientProfile,
  buildGetActionHistory,
  buildLogAction,
  buildSendAdvisorAlert,
};

export function buildSharedTools(vault: VaultService) {
  return {
    getClientProfile: buildGetClientProfile(vault),
    getActionHistory: buildGetActionHistory(vault),
    logAction: buildLogAction(vault),
    sendAdvisorAlert: buildSendAdvisorAlert(vault),
  };
}
