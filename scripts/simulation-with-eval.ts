/**
 * Runs a simulation with real Mastra agents, then the eval suite (which persists `EvalRun`).
 *
 * Note: `SimulationRun` holds simulation metrics; `EvalRun` is written only by `runAllEvals`
 * and scores fixed scenarios on seeded demo clients (CLT-*), not the @example.com cohort.
 */
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: resolve(process.cwd(), ".env") });
loadEnv({ path: resolve(process.cwd(), ".env.local"), override: true });

function ensureDatabaseUrlForPrisma(): void {
  if (process.env.DATABASE_URL?.trim()) return;

  console.error("[sim+eval] DATABASE_URL is missing. Copy .env.docker.example to .env.local and run npm run infra:up.");
  process.exit(1);
}

ensureDatabaseUrlForPrisma();

const CLIENT_COUNT = 5;
const SIMULATED_DAYS = 2;

async function main() {
  const { SimulationOrchestrator } = await import("@/lib/simulation/orchestrator");
  const { runAllEvals } = await import("@/evals/run");
  const { prisma } = await import("@/lib/db/client");

  const orchestrator = new SimulationOrchestrator();

  console.log(
    `[sim+eval] Simulation: ${CLIENT_COUNT} clients, ${SIMULATED_DAYS} day(s), real agents`
  );

  const simRun = await orchestrator.createSimulationRun({
    clientCount: CLIENT_COUNT,
    simulatedDays: SIMULATED_DAYS,
    clientResponseRate: 0.8,
    advisorResponseRate: 0.9,
    randomSeed: `real-eval-${Date.now()}`,
    useMockAgents: false,
  });

  await orchestrator.seedSimulationClients(CLIENT_COUNT, simRun.id);

  await prisma.simulationRun.update({
    where: { id: simRun.id },
    data: { batchesTotal: SIMULATED_DAYS },
  });

  for (let day = 0; day < SIMULATED_DAYS; day++) {
    const tick = await orchestrator.tick(simRun.id, day);
    console.log(
      `[sim+eval] Day ${day}: clients=${tick.clientCount}, docEvents=${tick.eventsTriggered}`
    );
    await orchestrator.incrementProgress(simRun.id);
  }

  const simulationFinal = await orchestrator.getRun(simRun.id);
  console.log(
    `[sim+eval] Simulation complete: id=${simulationFinal?.id} status=${simulationFinal?.status} batches=${simulationFinal?.batchesCompleted}/${simulationFinal?.batchesTotal}`
  );

  console.log("[sim+eval] Running eval suite (OpenRouter + scorers; writes EvalRun)...");
  const evalSummary = await runAllEvals(3, { enforceThreshold: false });

  const evalRow = await prisma.evalRun.findUniqueOrThrow({
    where: { id: evalSummary.evalRunId },
  });

  const output = {
    simulationRun: simulationFinal,
    evalRun: evalRow,
    evalSummary: {
      evalRunId: evalSummary.evalRunId,
      overallScore: evalSummary.overallScore,
      scorerBreakdown: evalSummary.scorerBreakdown,
    },
  };

  console.log("\n========== RESULT JSON ==========\n");
  console.log(JSON.stringify(output, null, 2));
  console.log("\n========== END ==========\n");
}

main()
  .catch((e) => {
    console.error("[sim+eval] Failed:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { prisma } = await import("@/lib/db/client");
    await prisma.$disconnect();
  });
