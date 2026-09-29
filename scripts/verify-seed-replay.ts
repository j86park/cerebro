import assert from "node:assert/strict";
import { prisma } from "@/lib/db/client";
import { queues, connection } from "@/lib/queue/client";
import { SimulationOrchestrator } from "@/lib/simulation/orchestrator";

const orchestrator = new SimulationOrchestrator();
const fixedStart = new Date("2026-01-01T00:00:00.000Z");
const days = 31;

async function replay(seed: string) {
  const created = await orchestrator.createSimulationRun({
    clientCount: 3,
    simulatedDays: days,
    clientResponseRate: 0.65,
    advisorResponseRate: 0.8,
    randomSeed: seed,
    useMockAgents: true,
  });
  const runId = created.id;
  await prisma.simulationRun.update({
    where: { id: runId },
    data: { startedAt: fixedStart, batchesTotal: days },
  });
  await orchestrator.seedSimulationClients(3, runId);
  for (let day = 0; day < days; day++) {
    await orchestrator.tick(runId, day);
    await orchestrator.incrementProgress(runId);
  }
  const run = await prisma.simulationRun.findUniqueOrThrow({ where: { id: runId } });
  assert.equal(run.status, "COMPLETED");
  const clients = await prisma.client.findMany({
    where: { simulationRunId: runId },
    include: { documents: true, agentActions: true },
  });
  const state = clients.map((client) => ({
    index: Number(client.email.match(/-(\d+)@example\.com$/)?.[1]),
    name: client.name,
    accountType: client.accountType,
    onboardingStage: client.onboardingStage,
    onboardingStatus: client.onboardingStatus,
    documents: client.documents.map((document) => ({
      type: document.type,
      status: document.status,
      notificationCount: document.notificationCount,
      expiryDate: document.expiryDate?.toISOString(),
      uploadedAt: document.uploadedAt?.toISOString(),
    })).sort((a, b) => a.type.localeCompare(b.type)),
    actions: client.agentActions.map((action) => ({
      actionType: action.actionType,
      outcome: action.outcome,
      stage: action.stage,
      agentType: action.agentType,
      effectiveAt: action.effectiveAt?.toISOString(),
    })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  })).sort((a, b) => a.index - b.index);
  const metrics = run.metrics as Record<string, unknown>;
  return { runId, state, metrics: {
    ...metrics,
    documentStatusDistribution: (metrics.documentStatusDistribution as Array<{ status: string }> | undefined)
      ?.sort((a, b) => a.status.localeCompare(b.status)),
  } };
}

async function main() {
  const seed = `seed-replay-${Date.now()}`;
  const first = await replay(seed);
  const second = await replay(seed);
  assert.deepEqual(second.state, first.state, "same seed must reproduce persisted client, document, and action state");
  assert.deepEqual(second.metrics, first.metrics, "same seed must reproduce reported metrics");
  console.log(JSON.stringify({ result: "PASS", seed, runIds: [first.runId, second.runId],
    clients: first.state.length, days, metrics: first.metrics }));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await Promise.all(Object.values(queues).map((queue) => queue.close()));
  await connection.quit();
  await prisma.$disconnect();
  process.exit(process.exitCode ?? 0);
});
