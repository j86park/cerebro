import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";

// Load env before any module that imports Prisma or `@/lib/config` (imports are hoisted otherwise).
// Local development uses the Docker Compose connection from `.env.local`.
loadEnv({ path: resolve(process.cwd(), ".env") });
loadEnv({ path: resolve(process.cwd(), ".env.local"), override: true });

function ensureDatabaseUrlForPrisma(): void {
  if (process.env.DATABASE_URL?.trim()) return;

  console.error(
    "[smoke] DATABASE_URL is missing or empty after loading .env.local and .env.\n" +
      "  Copy .env.docker.example to .env.local, then run npm run infra:up and npm run db:migrate:local."
  );
  process.exit(1);
}

ensureDatabaseUrlForPrisma();

const CLIENT_COUNT = 10;
const SIMULATED_DAYS = 2;

async function main() {
  const { SimulationOrchestrator } = await import("@/lib/simulation/orchestrator");
  const { prisma } = await import("@/lib/db/client");

  const orchestrator = new SimulationOrchestrator();

  console.log(
    `[smoke] Starting simulation: ${CLIENT_COUNT} clients, ${SIMULATED_DAYS} day(s), mock agents`
  );

  const run = await orchestrator.createSimulationRun({
    clientCount: CLIENT_COUNT,
    simulatedDays: SIMULATED_DAYS,
    clientResponseRate: 0.8,
    advisorResponseRate: 0.9,
    randomSeed: `smoke-${Date.now()}`,
    useMockAgents: true,
  });
  console.log(`[smoke] Created run ${run.id}`);

  const seedResult = await orchestrator.seedSimulationClients(CLIENT_COUNT, run.id);
  console.log(`[smoke] Seeded simulation clients: ${seedResult.count}`);

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
