import assert from "node:assert/strict";
import { prisma } from "@/lib/db/client";
import { VaultService } from "@/lib/db/vault-service";

async function main() {
  const client = await prisma.client.create({ data: {
    firmId: "CEREBRO-SIM-FIRM", advisorId: "CEREBRO-SIM-ADVISOR",
    name: "Clock boundary fixture", email: `clock-${Date.now()}@example.com`, accountType: "TFSA",
  } });
  const document = await prisma.document.create({ data: {
    id: `${client.id}-GOVERNMENT_ID`, clientId: client.id,
    type: "GOVERNMENT_ID", category: "IDENTITY", status: "EXPIRED",
  } });
  const start = new Date("2026-05-01T12:00:00.000Z");
  const at = (days: number) => new VaultService({ clientId: client.id,
    now: new Date(start.getTime() + days * 24 * 60 * 60 * 1000) });
  const first = await at(0).logAction({ agentType: "ONBOARDING", actionType: "ADVANCE_STAGE",
    trigger: "SIMULATION", reasoning: "Synthetic Stage 1 to Stage 2 advancement for clock boundary verification.",
    outcome: "ADVANCED_FROM_STAGE_1_TO_2", stage: 1 });
  const recorded = first as unknown as { effectiveAt: Date | null; performedAt: Date };
  assert.equal(recorded.effectiveAt?.toISOString(), start.toISOString());
  assert(Math.abs(recorded.performedAt.getTime() - Date.now()) < 60_000);
  await assert.rejects(at(3 - 1 / 86_400).checkActionCooldown("ADVANCE_STAGE", 3, undefined, 1), /cooldown/i);
  await at(3).checkActionCooldown("ADVANCE_STAGE", 3, undefined, 1);
  await at(0).checkActionCooldown("ADVANCE_STAGE", 3, undefined, 2);

  await at(0).logAction({ documentId: document.id, agentType: "COMPLIANCE",
    actionType: "SEND_CLIENT_REMINDER", trigger: "SIMULATION",
    reasoning: "Synthetic Stage 2 reminder for five-day clock boundary verification.",
    outcome: "DRY_RUN", stage: 2 });
  await assert.rejects(at(5 - 1 / 86_400).checkActionCooldown("SEND_CLIENT_REMINDER", 5, document.id), /cooldown/i);
  await at(5).checkActionCooldown("SEND_CLIENT_REMINDER", 5, document.id);
  console.log(JSON.stringify({ ok: true, clientId: client.id, auditTime: recorded.performedAt,
    effectiveAt: recorded.effectiveAt, stageScoped: true, threeDayBoundary: true, fiveDayBoundary: true }));
}

main().catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
