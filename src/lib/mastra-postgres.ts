import { Pool } from "pg";
import { PostgresStore } from "@mastra/pg";
import { env } from "@/lib/config";

type MastraPgGlobal = typeof globalThis & {
  __CEREBRO_MASTRA_PG_POOL__?: Pool;
  __CEREBRO_MASTRA_PG_STORES__?: {
    main: PostgresStore;
    compliance: PostgresStore;
    onboarding: PostgresStore;
  };
};

/**
 * Mastra's PostgresStore opens a `pg` pool per instance. Three stores (Mastra + two agent
 * memories) against Supabase quickly hit "Max client connections reached". One shared pool
 * keeps total connections bounded (see `MASTRA_PG_POOL_MAX` in config).
 */
function getPool(): Pool {
  const g = globalThis as MastraPgGlobal;
  if (!g.__CEREBRO_MASTRA_PG_POOL__) {
    g.__CEREBRO_MASTRA_PG_POOL__ = new Pool({
      connectionString: env.DATABASE_URL,
      max: env.MASTRA_PG_POOL_MAX,
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 20_000,
    });
  }
  return g.__CEREBRO_MASTRA_PG_POOL__;
}

function getStores(): NonNullable<MastraPgGlobal["__CEREBRO_MASTRA_PG_STORES__"]> {
  const g = globalThis as MastraPgGlobal;
  if (!g.__CEREBRO_MASTRA_PG_STORES__) {
    const pool = getPool();
    g.__CEREBRO_MASTRA_PG_STORES__ = {
      main: new PostgresStore({ id: "cerebro-storage", pool }),
      compliance: new PostgresStore({ id: "compliance-storage", pool }),
      onboarding: new PostgresStore({ id: "onboarding-storage", pool }),
    };
  }
  return g.__CEREBRO_MASTRA_PG_STORES__;
}

export const mastraPostgres = {
  getPool,
  get mainStore(): PostgresStore {
    return getStores().main;
  },
  get complianceMemoryStore(): PostgresStore {
    return getStores().compliance;
  },
  get onboardingMemoryStore(): PostgresStore {
    return getStores().onboarding;
  },
} as const;
