import assert from "node:assert/strict";
import { POST } from "@/app/api/simulation/runs/route";
import { prisma } from "@/lib/db/client";
import { queues, connection } from "@/lib/queue/client";

async function main() {
  const response = await POST(new Request("http://localhost/api/simulation/runs", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ clientCount: 101, simulatedDays: 2,
      clientResponseRate: 1, advisorResponseRate: 1, useMockAgents: true,
      randomSeed: `day-barrier-${Date.now()}` }),
  }));
  const body = await response.json();
  assert.equal(response.status, 201, JSON.stringify(body));
  const runId = body.data.run.id as string;
  const { workers } = await import("@/lib/queue/workers");
  try {
    let run = await prisma.simulationRun.findUniqueOrThrow({ where: { id: runId } });
    for (let i = 0; i < 120 && run.status !== "COMPLETED" && run.status !== "FAILED"; i++) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      run = await prisma.simulationRun.findUniqueOrThrow({ where: { id: runId } });
    }
    const batches = await prisma.simulationBatchCompletion.findMany({ where: { runId },
      orderBy: [{ batchStart: "asc" }, { clientStart: "asc" }] });
    const day0 = batches.filter((batch) => batch.batchStart === 0);
    const day1 = batches.filter((batch) => batch.batchStart === 1);
    assert.equal(run.status, "COMPLETED");
    assert.equal(run.batchesCompleted, 4);
    assert.deepEqual(day0.map((batch) => batch.clientStart), [0, 100]);
    assert.deepEqual(day1.map((batch) => batch.clientStart), [0, 100]);
    assert(Math.max(...day0.map((batch) => batch.completedAt.getTime()))
      <= Math.min(...day1.map((batch) => batch.completedAt.getTime())));
    const metrics = run.metrics as { simulatedDaysProcessed?: number } | null;
    assert.equal(metrics?.simulatedDaysProcessed, 2);
    console.log(JSON.stringify({ ok: true, runId, batches: run.batchesCompleted,
      days: metrics?.simulatedDaysProcessed, day0Last: day0[1].completedAt,
      day1First: day1[0].completedAt }));
  } finally {
    await Promise.all(Object.values(workers).map((worker) => worker.close()));
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await Promise.all(Object.values(queues).map((queue) => queue.close()));
  await connection.quit();
  await prisma.$disconnect();
  process.exit(process.exitCode ?? 0);
});
