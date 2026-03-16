import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { ONBOARDING_SYSTEM_PROMPT } from "./prompts";
import { getModel } from "@/lib/config";

export const onboardingAgent = new Agent({
  id: "onboardingAgent",
  name: "Cerebro Onboarding Agent",
  instructions: ONBOARDING_SYSTEM_PROMPT,
  model: getModel("dev"),
  memory: new Memory(),
  // Tools will be injected at runtime via vault-scoped factories (Phase 4)
});
