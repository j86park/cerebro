import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { mastraPostgres } from "@/lib/mastra-postgres";
import { COMPLIANCE_SYSTEM_PROMPT } from "./prompts";
import { COMPLIANCE_WORKING_MEMORY_SCHEMA } from "./memory-schema";
import { getModel } from "@/lib/config";

export const complianceAgent = new Agent({
  id: "complianceAgent",
  name: "Cerebro Compliance Agent",
  instructions: COMPLIANCE_SYSTEM_PROMPT,
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
  // Tools will be injected at runtime via vault-scoped factories (Phase 4)
});
