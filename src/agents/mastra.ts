import { Mastra } from "@mastra/core";
import { getComplianceAgent } from "./compliance/agent";
import { getOnboardingAgent } from "./onboarding/agent";
import { mastraPostgres } from "@/lib/mastra-postgres";
import { registerCerebroMemoClear } from "@/lib/agent-runtime-registry";

let _cerebro: Mastra | null = null;
let _initPromise: Promise<Mastra> | null = null;

/**
 * Lazily constructs the shared `Mastra` instance after async prompt load for both agents.
 */
export async function getCerebro(): Promise<Mastra> {
  if (_cerebro) return _cerebro;
  if (!_initPromise) {
    _initPromise = (async () => {
      const [complianceAgent, onboardingAgent] = await Promise.all([
        getComplianceAgent(),
        getOnboardingAgent(),
      ]);
      _cerebro = new Mastra({
        agents: {
          complianceAgent,
          onboardingAgent,
        },
        storage: mastraPostgres.mainStore,
      });
      return _cerebro;
    })();
  }
  return _initPromise;
}

registerCerebroMemoClear(() => {
  _cerebro = null;
  _initPromise = null;
});
