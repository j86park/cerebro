import type { ZodType } from "zod";
import { env, getModel, isObservationalMemoryEnabled } from "@/lib/config";

/**
 * Shared Mastra Memory options for Compliance / Onboarding agents.
 * Working memory always on; Observational Memory only when the T2.1 pilot flag
 * is enabled and not blocked by DRY_RUN / test (see `isObservationalMemoryEnabled`).
 */
export function buildAgentMemoryOptions(workingMemorySchema: ZodType) {
  const options: {
    lastMessages: number;
    workingMemory: { enabled: true; schema: ZodType };
    observationalMemory?: {
      model: ReturnType<typeof getModel>;
      scope: "thread";
    };
  } = {
    lastMessages: 20,
    workingMemory: {
      enabled: true,
      schema: workingMemorySchema,
    },
  };

  if (isObservationalMemoryEnabled()) {
    // Use config-resolved model only — never hardcode Mastra's default gemini string.
    options.observationalMemory = {
      model: getModel("dev"),
      // Thread scope keeps OM inside the client+agent memory resource (no cross-client).
      scope: "thread",
    };
  }

  return options;
}

/**
 * Returns a human-readable reason OM is off (for tests / ops diagnostics).
 */
export function observationalMemoryDisabledReason(): string | null {
  if (!env.AGENT_OBSERVATIONAL_MEMORY) {
    return "AGENT_OBSERVATIONAL_MEMORY=false (T2.1 gate unmet — no long-thread pressure proven)";
  }
  if (env.DRY_RUN) {
    return "DRY_RUN=true (OM would spend OpenRouter; disabled for dry-run safety)";
  }
  if (env.NODE_ENV === "test") {
    return "NODE_ENV=test ($0 CI must not enable OM Observer/Reflector LLM calls)";
  }
  return null;
}
