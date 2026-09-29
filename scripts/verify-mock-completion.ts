import assert from "node:assert/strict";
import { POST } from "@/app/api/simulation/runs/route";
import { prisma } from "@/lib/db/client";
import { queues, connection } from "@/lib/queue/client";

async function main() {
  const response = await POST(new Request("http://localhost/api/simulation/runs", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ clientCount: 3, simulatedDays: 90,
      clientResponseRate: 1, advisorResponseRate: 1, useMockAgents: true,
      randomSeed: `mock-e2e-${Date.now()}` }),
  }));
  const body = await response.json();
  assert.equal(response.status, 201, JSON.stringify(body));
  const runId = body.data.run.id as string;
  const onboardingClient = await prisma.client.findFirstOrThrow({ where: { email: `sim-${runId}-0@example.com` } });
  const complianceClient = await prisma.client.findFirstOrThrow({ where: { email: `sim-${runId}-2@example.com` } });
  await prisma.document.deleteMany({ where: { clientId: onboardingClient.id } });
  await prisma.client.update({ where: { id: onboardingClient.id }, data: { onboardingStage: 0, onboardingStatus: "IN_PROGRESS" } });
  const complianceId = `${complianceClient.id}-GOVERNMENT_ID`;
  await prisma.document.upsert({ where: { id: complianceId },
    update: { status: "EXPIRED", expiryDate: new Date("2024-01-01T00:00:00.000Z") },
    create: { id: complianceId, clientId: complianceClient.id, type: "GOVERNMENT_ID", category: "IDENTITY",
      status: "EXPIRED", expiryDate: new Date("2024-01-01T00:00:00.000Z") } });

  const { workers } = await import("@/lib/queue/workers");
  try {
    let run = await prisma.simulationRun.findUniqueOrThrow({ where: { id: runId } });
    for (let i = 0; i < 240 && run.status !== "COMPLETED" && run.status !== "FAILED"; i++) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      run = await prisma.simulationRun.findUniqueOrThrow({ where: { id: runId } });
    }
    const onboarding = await prisma.client.findUniqueOrThrow({ where: { id: onboardingClient.id } });
    const complianceDoc = await prisma.document.findFirst({ where: { clientId: complianceClient.id, type: "GOVERNMENT_ID" } });
    const complianceActions = await prisma.agentAction.findMany({ where: { clientId: complianceClient.id, agentType: "COMPLIANCE" },
      select: { actionType: true, outcome: true, stage: true, actor: true, reasonCodes: true } });
    const escalationStates = await prisma.escalationState.findMany({ where: { clientId: complianceClient.id },
      select: { ladderStage: true, status: true, reasonCodes: true } });
    const failed = (await queues.simulation.getFailed(0, 20)).filter((job) => job.data.runId === runId)
      .map((job) => ({ id: job.id, reason: job.failedReason }));
    console.log(JSON.stringify({ runId, runStatus: run.status, batches: [run.batchesCompleted, run.batchesTotal],
      metrics: run.metrics, onboarding: { stage: onboarding.onboardingStage, status: onboarding.onboardingStatus,
        documents: await prisma.document.count({ where: { clientId: onboarding.id, status: "VALID" } }) },
      compliance: { status: complianceDoc?.status, notificationCount: complianceDoc?.notificationCount,
        actions: complianceActions.filter((a) => a.actionType !== "SCAN_VAULT"), escalationStates }, failed }));
    assert.equal(run.status, "COMPLETED");
    assert.equal(onboarding.onboardingStatus, "COMPLETED");
    assert.equal(complianceDoc?.status, "EXPIRED");
    assert(complianceActions.some((a) => a.actionType === "SEND_CLIENT_REMINDER" && a.stage === 2));
    assert(complianceActions.some((a) => a.actionType === "ESCALATE_MANAGEMENT" && a.outcome === "DRY_RUN"));
    for (const stage of [4, 5]) {
      assert(complianceActions.some((a) => a.stage === stage && a.outcome === "HITL_SUSPENDED"));
      assert(complianceActions.some((a) => a.stage === stage && a.actor === "ADVISOR"
        && a.reasonCodes.includes("HITL_APPROVED")));
      assert(escalationStates.some((state) => state.ladderStage === stage && state.status === "RESOLVED"
        && state.reasonCodes.includes("HITL_APPROVED")));
    }
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
