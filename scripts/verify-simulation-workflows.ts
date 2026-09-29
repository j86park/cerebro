import assert from "node:assert/strict";
import { prisma } from "@/lib/db/client";
import { queues, connection } from "@/lib/queue/client";
import { POST } from "@/app/api/simulation/runs/route";
import { SimulationOrchestrator } from "@/lib/simulation/orchestrator";
import { VaultService } from "@/lib/db/vault-service";
import { processHitlResumeFromEscalation } from "@/lib/hitl/resume";

async function start(seed: string) {
  const response = await POST(new Request("http://localhost/api/simulation/runs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ clientCount: 2, simulatedDays: 1, randomSeed: seed }),
  }));
  const body = await response.json();
  assert.equal(response.status, 201, JSON.stringify(body));
  return body.data.run.id as string;
}

async function waitForCompletion(runId: string) {
  for (let i = 0; i < 60; i++) {
    const run = await prisma.simulationRun.findUniqueOrThrow({ where: { id: runId } });
    if (run.status === "COMPLETED") return run;
    if (run.status === "FAILED") throw new Error(`Run ${runId} failed`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Run ${runId} did not complete within 30 seconds`);
}

async function main() {
  const marker = `verify-${Date.now()}`;
  const runA = await start(`${marker}-a`);
  const runB = await start(`${marker}-b`);
  const aClients = await prisma.client.findMany({ where: { simulationRunId: runA } });
  const bClients = await prisma.client.findMany({ where: { simulationRunId: runB } });
  assert.equal(aClients.length, 2);
  assert.equal(bClients.length, 2);
  assert.equal(new Set([...aClients, ...bClients].map((c) => c.id)).size, 4);

  const unrelated = await prisma.client.create({
    data: {
      firmId: "CEREBRO-SIM-FIRM",
      advisorId: "CEREBRO-SIM-ADVISOR",
      name: "Unrelated fixture",
      email: `${marker}@example.com`,
      accountType: "INVESTMENT",
    },
  });
  const unrelatedDoc = await prisma.document.create({
    data: {
      id: `${marker}-SIM-unrelated`,
      clientId: unrelated.id,
      type: "GOVERNMENT_ID",
      category: "IDENTITY",
      status: "VALID",
    },
  });

  const scopedVault = new VaultService({ clientId: bClients[0].id });
  await assert.rejects(scopedVault.getDocumentById(unrelatedDoc.id), /Cross-client document access denied/);
  const audit = await prisma.agentAction.findFirst({
    where: { clientId: bClients[0].id, actionType: "DOCUMENT_ACCESS_DENIED" },
  });
  assert.equal(audit?.documentId, null);
  assert.equal((audit?.citedFields as { documentId?: string })?.documentId, unrelatedDoc.id);
  const timeout = await processHitlResumeFromEscalation({
    vault: scopedVault,
    clientId: bClients[0].id,
    openKey: `${marker}-resolved-approval`,
    workflowRunId: `${marker}-workflow`,
    decision: "timeout",
  });
  assert.equal(timeout.outcome, "HITL_TIMEOUT_ALREADY_RESOLVED");

  const { workers } = await import("@/lib/queue/workers");
  try {
    const [completedA, completedB] = await Promise.all([
      waitForCompletion(runA), waitForCompletion(runB),
    ]);
    assert.equal(completedA.batchesCompleted, 1);
    assert.equal(completedB.batchesCompleted, 1);
    const aJob = await queues.simulation.getJob(`simulation-${runA}-0-0`);
    assert.equal(await aJob?.getState(), "completed");

    const orchestrator = new SimulationOrchestrator();
    assert.equal(await orchestrator.isBatchComplete(runA, 0, 0), true);
    const duplicate = await orchestrator.completeBatch(runA, 0, 0);
    assert.equal(duplicate.completed, false);
    assert.equal((await orchestrator.getRun(runA))?.batchesCompleted, 1);
    await assert.rejects(orchestrator.tick(runA, 0), /refusing stale batch/);

    const beforeB = await prisma.agentAction.count({ where: { client: { simulationRunId: runB } } });
    const purged = await orchestrator.purgeSimulationData(runA);
    assert.equal(purged.purgedClients, 2);
    assert.equal(await prisma.client.count({ where: { simulationRunId: runA } }), 0);
    assert.equal(await prisma.client.count({ where: { simulationRunId: runB } }), 2);
    assert.equal(await prisma.agentAction.count({ where: { client: { simulationRunId: runB } } }), beforeB);
    assert.equal((await prisma.document.findUnique({ where: { id: unrelatedDoc.id } }))?.id, unrelatedDoc.id);
    console.log(JSON.stringify({ ok: true, runA, runB, unrelatedDoc: unrelatedDoc.id, beforeB, purged, deniedAccessAudit: audit?.id, timeoutReplay: timeout.outcome }));
  } finally {
    await Promise.all(Object.values(workers).map((worker) => worker.close()));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await Promise.all(Object.values(queues).map((queue) => queue.close()));
  await connection.quit();
  await prisma.$disconnect();
  // The shared worker module also loads background eval workers with persistent Redis handles.
  process.exit(process.exitCode ?? 0);
});
