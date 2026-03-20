import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";

// Load env before any module that imports Prisma or `@/lib/config` (imports are hoisted otherwise).
loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

/**
 * Prisma's datasource only reads `DATABASE_URL`. Map common Supabase/Vercel names so a single
 * connection string in `.env.local` is enough for smoke runs.
 */
function ensureDatabaseUrlForPrisma(): void {
  const direct = process.env.DATABASE_URL?.trim();
  if (direct) return;

  const fallback = [
    process.env.DIRECT_URL,
    process.env.POSTGRES_URL,
    process.env.POSTGRES_PRISMA_URL,
  ].find((u) => typeof u === "string" && u.trim().length > 0);

  if (fallback) {
    process.env.DATABASE_URL = fallback.trim();
    console.warn(
      "[smoke] DATABASE_URL was unset; using DIRECT_URL / POSTGRES_URL / POSTGRES_PRISMA_URL for Prisma."
    );
    return;
  }

  console.error(
    "[smoke] DATABASE_URL is missing or empty after loading .env.local and .env.\n" +
      "  Add your Postgres connection string as DATABASE_URL (Supabase: Settings → Database → URI).\n" +
      "  Or set DIRECT_URL, POSTGRES_URL, or POSTGRES_PRISMA_URL and this script will map it."
  );
  process.exit(1);
}

ensureDatabaseUrlForPrisma();

const CLIENT_COUNT = 5;
const SIMULATED_DAYS = 1;

async function main() {
  const { SimulationOrchestrator } = await import("@/lib/simulation/orchestrator");
  const { prisma } = await import("@/lib/db/client");

  const orchestrator = new SimulationOrchestrator();

  console.log(
    `[smoke] Starting simulation: ${CLIENT_COUNT} clients, ${SIMULATED_DAYS} day(s), mock agents`
  );

  const seedResult = await orchestrator.seedSimulationClients(CLIENT_COUNT);
  console.log(`[smoke] Seeded simulation clients: ${seedResult.count}`);

  const run = await orchestrator.createSimulationRun({
    clientCount: CLIENT_COUNT,
    simulatedDays: SIMULATED_DAYS,
    clientResponseRate: 0.8,
    advisorResponseRate: 0.9,
    randomSeed: `smoke-${Date.now()}`,
    useMockAgents: true,
  });
  console.log(`[smoke] Created run ${run.id}`);

  await prisma.simulationRun.update({
    where: { id: run.id },
    data: { batchesTotal: SIMULATED_DAYS },
  });

  for (let day = 0; day < SIMULATED_DAYS; day++) {
    const tick = await orchestrator.tick(run.id, day);
    console.log(
      `[smoke] Day ${day}: clients=${tick.clientCount}, events=${tick.eventsTriggered}`
    );
    await orchestrator.incrementProgress(run.id);
  }

  const final = await orchestrator.getRun(run.id);
  console.log(
    `[smoke] Final status=${final?.status} batches=${final?.batchesCompleted}/${final?.batchesTotal}`
  );
  console.log("[smoke] Done.");
}

main()
  .catch((e) => {
    console.error("[smoke] Failed:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { prisma } = await import("@/lib/db/client");
    await prisma.$disconnect();
  });
