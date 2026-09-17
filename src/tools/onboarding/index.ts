import type { VaultService } from "@/lib/db/vault-service";
import { assertDomainToolAllowlist } from "@/lib/policy/toolAllowlists";
import { buildGetOnboardingStatus } from "./getOnboardingStatus";
import { buildRequestDocument } from "./requestDocument";
import { buildValidateDocumentReceived } from "./validateDocumentReceived";
import { buildSetDocumentStatus } from "./setDocumentStatus";
import { buildAdvanceOnboardingStage } from "./advanceOnboardingStage";
import { buildCompleteOnboarding } from "./completeOnboarding";
import { buildAlertAdvisorStuck } from "./alertAdvisorStuck";

export {
  buildGetOnboardingStatus,
  buildRequestDocument,
  buildValidateDocumentReceived,
  buildSetDocumentStatus,
  buildAdvanceOnboardingStage,
  buildCompleteOnboarding,
  buildAlertAdvisorStuck,
};

/**
 * Builds the onboarding domain toolset and asserts the agent tool allowlist.
 */
export function buildOnboardingTools(vault: VaultService) {
  const tools = {
    getOnboardingStatus: buildGetOnboardingStatus(vault),
    requestDocument: buildRequestDocument(vault),
    validateDocumentReceived: buildValidateDocumentReceived(vault),
    setDocumentStatus: buildSetDocumentStatus(vault),
    advanceOnboardingStage: buildAdvanceOnboardingStage(vault),
    completeOnboarding: buildCompleteOnboarding(vault),
    alertAdvisorStuck: buildAlertAdvisorStuck(vault),
  };
  assertDomainToolAllowlist("onboarding", Object.keys(tools));
  return tools;
}
