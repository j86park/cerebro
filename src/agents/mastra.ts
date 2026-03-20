import { Mastra } from "@mastra/core";
import { complianceAgent } from "./compliance/agent";
import { onboardingAgent } from "./onboarding/agent";

import { mastraPostgres } from "@/lib/mastra-postgres";

export const cerebro = new Mastra({
  agents: {
    complianceAgent,
    onboardingAgent,
  },
  storage: mastraPostgres.mainStore,
});
