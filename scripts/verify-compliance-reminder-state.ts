import assert from "node:assert/strict";
import { prisma } from "@/lib/db/client";
import { VaultService } from "@/lib/db/vault-service";
import { buildSendClientReminder } from "@/tools/compliance/sendClientReminder";
import { env } from "@/lib/config";

async function main() {
  assert.equal(env.DRY_RUN, true, "This verification must not send email");
  await prisma.firm.upsert({ where: { id: "CEREBRO-SIM-FIRM" }, create: { id: "CEREBRO-SIM-FIRM", name: "Cerebro simulation" }, update: {} });
  await prisma.advisor.upsert({ where: { id: "CEREBRO-SIM-ADVISOR" }, create: {
    id: "CEREBRO-SIM-ADVISOR", firmId: "CEREBRO-SIM-FIRM", name: "Simulation Advisor", email: "cerebro-simulation-advisor@invalid.example",
  }, update: {} });
  const client = await prisma.client.create({ data: {
    firmId: "CEREBRO-SIM-FIRM", advisorId: "CEREBRO-SIM-ADVISOR",
    name: "Synthetic reminder verification", email: `reminder-verify-${Date.now()}@example.com`, accountType: "INVESTMENT",
  } });
  const documentId = `${client.id}-GOVERNMENT_ID`;
  await prisma.document.create({ data: {
    id: documentId, clientId: client.id, type: "GOVERNMENT_ID", category: "IDENTITY",
    status: "EXPIRED", expiryDate: new Date("2024-01-01T00:00:00.000Z"),
  } });
  const vault = new VaultService({ clientId: client.id });
  await vault.logAction({ agentType: "COMPLIANCE", actionType: "NOTIFY_ADVISOR", trigger: "MANUAL",
    reasoning: "Synthetic expired ID requires Stage 1 advisor alert before reminder.", outcome: "DRY_RUN", stage: 1 });

  const tool = buildSendClientReminder(vault) as unknown as { execute(input: {
    documentId: string; subject: string; body: string; reasoning: string;
  }): Promise<{ success: boolean; notificationCount: number }> };
  const result = await tool.execute({ documentId, subject: "Expired ID reminder", body: "Please upload a current government ID.",
    reasoning: "Stage 2 reminder for an unresolved expired government ID after the advisor alert." });
  assert.equal(result.success, true);
  assert.equal(result.notificationCount, 1);
  const first = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
  assert.equal(first.status, "EXPIRED");
  assert.equal(first.notificationCount, 1);
  assert(first.lastNotifiedAt instanceof Date);

  const replay = await vault.recordDocumentNotification({ documentId,
    idempotencyKey: `compliance-reminder:${documentId}:stage-2`, reasoning: "Duplicate delivery retry must not update the document again.",
    outcome: "DRY_RUN", nextScheduledAt: new Date(env.DEMO_DATE), stage: 2, policyVersion: env.TOOL_POLICY_VERSION });
  assert.equal(replay.duplicate, true);
  assert.equal(replay.notificationCount, 1);
  assert.equal(await prisma.agentAction.count({ where: { clientId: client.id, actionType: "SEND_CLIENT_REMINDER" } }), 1);
  console.log(JSON.stringify({ ok: true, clientId: client.id, status: first.status,
    notificationCount: first.notificationCount, lastNotifiedAt: first.lastNotifiedAt, duplicate: replay.duplicate }));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await prisma.$disconnect();
});
