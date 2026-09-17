import { MockLanguageModelV3 } from "ai/test";
import {
  setModelOverride,
  type ModelInstance,
  type ModelTier,
} from "@/lib/config";

/**
 * Inert model for the unit/fixture lane: construction is allowed; any generate
 * attempt fails closed so default CI cannot spend OpenRouter tokens.
 */
export function createBlockedOpenRouterModel(tier: ModelTier): ModelInstance {
  const message =
    `OpenRouter model call blocked in unit/fixture Vitest lane (tier="${tier}"). ` +
    `Inject via setModelOverride(...), or run npm run test:live-eval with CI_LIVE_EVAL=1.`;

  return new MockLanguageModelV3({
    modelId: `blocked-openrouter-${tier}`,
    doGenerate: async () => {
      throw new Error(message);
    },
    doStream: async () => {
      throw new Error(message);
    },
  }) as unknown as ModelInstance;
}

/**
 * Installs the default unit/fixture lane guard: `getModel` returns a mock that
 * throws on generate (Agent construction OK; live LLM calls fail closed).
 */
export function installUnitLaneModelBlock(): void {
  setModelOverride((tier: ModelTier) => createBlockedOpenRouterModel(tier));
}
