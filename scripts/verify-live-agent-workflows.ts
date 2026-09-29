import assert from "node:assert/strict";
import { prisma } from "@/lib/db/client";
import { connection, queues } from "@/lib/queue/client";

// This script invokes the production processor directly; it must not start
// the background BullMQ workers that the worker module normally constructs.
process.env.VITEST = "true";

async function createClient(name: string) {
  const marker = `live-verify-${Date.now()}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return prisma.client.create({
    data: {
      firmId: "CEREBRO-SIM-FIRM",
      advisorId: "CEREBRO-SIM-ADVISOR",
      name,
      email: `${marker}@example.com`,
      accountType: "INVESTMENT",
    },
  });
}

async function runScenario(name: string, agentType: "COMPLIANCE" | "ONBOARDING", status: "EXPIRED" | "MISSING") {
  const client = await createClient(name);
  const document = await prisma.document.create({
    data: {
      id: `${client.id}-GOVERNMENT_ID`,
      clientId: client.id,
      type: "GOVERNMENT_ID",
      category: "IDENTITY",
      status,
      expiryDate: status === "EXPIRED" ? new Date("2025-01-01T00:00:00.000Z") : undefined,
    },
  });
  const jobId = `verify-${agentType.toLowerCase()}-${client.id}`;
  const { processAgentJob } = await import("@/lib/queue/workers");
  const result = await processAgentJob({
    id: jobId,
    data: { clientId: client.id, agentType, trigger: "MANUAL" },
  } as never);
  const actions = await prisma.agentAction.findMany({
    where: { clientId: client.id },
    select: { actionType: true, outcome: true, documentId: true, reasoning: true },
  });
  const decisions = await prisma.decisionRecord.findMany({
    where: { clientId: client.id },
    select: { outcome: true, toolExecuted: true },
  });
  const finalDocument = await prisma.document.findUniqueOrThrow({ where: { id: document.id } });
  const finalClient = await prisma.client.findUniqueOrThrow({ where: { id: client.id } });
  return {
    name, clientId: client.id, jobId, result,
    statusBefore: status, statusAfter: finalDocument.status,
    onboardingStageAfter: finalClient.onboardingStage,
    actions: actions.map(({ actionType, outcome, documentId }) => ({ actionType, outcome, documentId })),
    decisions,
  };
}

async function main() {
  const results = [];
  if (!process.argv.includes("--onboarding-only")) {
    const compliance = await runScenario("Expired compliance", "COMPLIANCE", "EXPIRED");
    results.push(compliance);
    assert(compliance.actions.some(({ actionType, outcome }) => actionType === "NOTIFY_ADVISOR" && outcome !== "POLICY_BLOCKED"),
      "Expired compliance document must trigger an advisor alert");
  }
  const onboarding = await runScenario("Missing onboarding", "ONBOARDING", "MISSING");
  results.push(onboarding);
  assert(onboarding.actions.some(({ actionType, outcome }) => actionType === "REQUEST_DOCUMENT" && outcome !== "POLICY_BLOCKED"),
    "Missing Stage 1 document must trigger a request");
  assert.equal(onboarding.statusAfter, "REQUESTED");
  assert.equal(onboarding.onboardingStageAfter, 1);
  console.log(JSON.stringify({ ok: true, results }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await Promise.all(Object.values(queues).map((queue) => queue.close()));
  await connection.quit();
  await prisma.$disconnect();
  process.exit(process.exitCode ?? 0);
});
