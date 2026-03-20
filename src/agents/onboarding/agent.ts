import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { mastraPostgres } from "@/lib/mastra-postgres";
import { ONBOARDING_SYSTEM_PROMPT } from "./prompts";
import { ONBOARDING_WORKING_MEMORY_SCHEMA } from "./memory-schema";
import { getModel } from "@/lib/config";

export const onboardingAgent = new Agent({
  id: "onboardingAgent",
  name: "Cerebro Onboarding Agent",
  instructions: ONBOARDING_SYSTEM_PROMPT,
  model: getModel("dev"),
  memory: new Memory({
    storage: mastraPostgres.onboardingMemoryStore,
    options: {
      lastMessages: 20,
      workingMemory: {
        enabled: true,
        schema: ONBOARDING_WORKING_MEMORY_SCHEMA,
      },
    },
  }),
  // Tools will be injected at runtime via vault-scoped factories (Phase 4)
});
