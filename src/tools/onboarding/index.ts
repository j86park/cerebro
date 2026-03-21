import type { VaultService } from "@/lib/db/vault-service";
import { buildGetOnboardingStatus } from "./getOnboardingStatus";
import { buildRequestDocument } from "./requestDocument";
import { buildValidateDocumentReceived } from "./validateDocumentReceived";
import { buildAdvanceOnboardingStage } from "./advanceOnboardingStage";
import { buildCompleteOnboarding } from "./completeOnboarding";
import { buildAlertAdvisorStuck } from "./alertAdvisorStuck";

export {
  buildGetOnboardingStatus,
  buildRequestDocument,
  buildValidateDocumentReceived,
  buildAdvanceOnboardingStage,
  buildCompleteOnboarding,
  buildAlertAdvisorStuck,
};

export function buildOnboardingTools(vault: VaultService) {
  return {
    getOnboardingStatus: buildGetOnboardingStatus(vault),
    requestDocument: buildRequestDocument(vault),
    validateDocumentReceived: buildValidateDocumentReceived(vault),
    advanceOnboardingStage: buildAdvanceOnboardingStage(vault),
    completeOnboarding: buildCompleteOnboarding(vault),
    alertAdvisorStuck: buildAlertAdvisorStuck(vault),
  };
}
