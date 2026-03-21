import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { mastraPostgres } from "@/lib/mastra-postgres";
import { COMPLIANCE_WORKING_MEMORY_SCHEMA } from "./memory-schema";
import { getModel } from "@/lib/config";
import { loadPrompt } from "@/lib/prompt-loader";
import { getRelevantLessons, injectLessons } from "@/lib/lessons-loader";
import { registerAgentMemoClear } from "@/lib/agent-runtime-registry";

let _instance: Agent | null = null;

/**
 * Returns the memoized compliance Mastra agent (instructions from DB + guard-rail lessons).
 */
export async function getComplianceAgent(): Promise<Agent> {
  if (_instance) return _instance;

  const base = await loadPrompt("compliance");
  const lessons = await getRelevantLessons("compliance");
  const instructions = injectLessons(base, lessons);

  _instance = new Agent({
    id: "complianceAgent",
    name: "Cerebro Compliance Agent",
    instructions,
    model: getModel("dev"),
    memory: new Memory({
      storage: mastraPostgres.complianceMemoryStore,
      options: {
        lastMessages: 20,
        workingMemory: {
          enabled: true,
          schema: COMPLIANCE_WORKING_MEMORY_SCHEMA,
        },
      },
    }),
  });

  return _instance;
}

registerAgentMemoClear("compliance", () => {
  _instance = null;
});
