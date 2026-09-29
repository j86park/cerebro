import { Client, Pool } from "pg";
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
      // First-use Mastra DDL runs many table initializers concurrently. A bounded
      // pool can have a legitimate queue longer than the ordinary 20s limit.
      connectionTimeoutMillis: 120_000,
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

let storageInitPromise: Promise<void> | null = null;

/** Serializes Mastra's first-use DDL across worker processes on the same DB. */
export function ensureMastraStorageInitialized(): Promise<void> {
  if (!storageInitPromise) {
    storageInitPromise = (async () => {
      // A dedicated connection leaves the bounded shared pool available for DDL.
      const lock = new Client({ connectionString: env.DATABASE_URL });
      await lock.connect();
      let acquired = false;
      try {
        // A blocking pg_advisory_lock query retains a virtual transaction ID.
        // Mastra's CREATE INDEX CONCURRENTLY then waits for that waiter while
        // the waiter waits for the initializer: an undetected lock cycle.
        // Poll a non-blocking lock so other processes remain idle between tries.
        const deadline = Date.now() + 5 * 60_000;
        while (!acquired) {
          const result = await lock.query<{ acquired: boolean }>(
            "SELECT pg_try_advisory_lock(hashtext('cerebro-mastra-storage-init')) AS acquired",
          );
          acquired = result.rows[0]?.acquired === true;
          if (!acquired) {
            if (Date.now() >= deadline) throw new Error("Timed out waiting for Mastra storage initialization lock");
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }
        await mastraPostgres.mainStore.init();
        await mastraPostgres.complianceMemoryStore.init();
        await mastraPostgres.onboardingMemoryStore.init();
      } finally {
        try {
          if (acquired) await lock.query("SELECT pg_advisory_unlock(hashtext('cerebro-mastra-storage-init'))");
        } finally {
          await lock.end();
        }
      }
    })().catch((error) => {
      storageInitPromise = null;
      throw error;
    });
  }
  return storageInitPromise;
}
