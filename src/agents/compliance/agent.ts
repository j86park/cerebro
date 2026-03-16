import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { COMPLIANCE_SYSTEM_PROMPT } from "./prompts";
import { getModel } from "@/lib/config";

export const complianceAgent = new Agent({
  id: "complianceAgent",
  name: "Cerebro Compliance Agent",
  instructions: COMPLIANCE_SYSTEM_PROMPT,
  model: getModel("dev"),
  memory: new Memory(),
  // Tools will be injected at runtime via vault-scoped factories (Phase 4)
});
