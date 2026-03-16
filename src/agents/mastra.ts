import { Mastra } from "@mastra/core";
import { complianceAgent } from "./compliance/agent";
import { onboardingAgent } from "./onboarding/agent";

// TODO: Install @mastra/pg and configure PostgresStore for production persistence
import { PostgresStore } from "@mastra/pg";
import { env } from "@/lib/config";

export const cerebro = new Mastra({
  agents: {
    complianceAgent,
    onboardingAgent,
  },
  storage: new PostgresStore({ id: "cerebro-storage", connectionString: env.DATABASE_URL }),
});
