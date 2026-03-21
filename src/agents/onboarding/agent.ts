import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { mastraPostgres } from "@/lib/mastra-postgres";
import { ONBOARDING_WORKING_MEMORY_SCHEMA } from "./memory-schema";
import { getModel } from "@/lib/config";
import { loadPrompt } from "@/lib/prompt-loader";
import { getRelevantLessons, injectLessons } from "@/lib/lessons-loader";
import { registerAgentMemoClear } from "@/lib/agent-runtime-registry";

let _instance: Agent | null = null;

/**
 * Returns the memoized onboarding Mastra agent (instructions from DB + guard-rail lessons).
 */
export async function getOnboardingAgent(): Promise<Agent> {
  if (_instance) return _instance;

  const base = await loadPrompt("onboarding");
  const lessons = await getRelevantLessons("onboarding");
  const instructions = injectLessons(base, lessons);

  _instance = new Agent({
    id: "onboardingAgent",
    name: "Cerebro Onboarding Agent",
    instructions,
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
  });

  return _instance;
}

registerAgentMemoClear("onboarding", () => {
  _instance = null;
});
