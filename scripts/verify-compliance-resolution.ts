import assert from "node:assert/strict";
import { prisma } from "@/lib/db/client";
import { VaultService } from "@/lib/db/vault-service";
import { buildMarkResolved } from "@/tools/compliance/markResolved";
import { getComplianceScorecard } from "@/lib/compliance/scorecard";
import { env } from "@/lib/config";

async function main() {
  assert.equal(env.DRY_RUN, true, "Resolution verification must use DRY_RUN");
  const firmId = "CEREBRO-SIM-FIRM";
  const advisorId = "CEREBRO-SIM-ADVISOR";
  await prisma.firm.upsert({ where: { id: firmId }, create: { id: firmId, name: "Synthetic verification firm" }, update: {} });
  await prisma.advisor.upsert({ where: { id: advisorId }, create: {
    id: advisorId, firmId, name: "Synthetic advisor", email: "synthetic-advisor@invalid.example",
  }, update: {} });
  const client = await prisma.client.create({ data: { firmId, advisorId,
    name: "Synthetic replacement resolution", email: `resolution-${Date.now()}@example.com`, accountType: "INVESTMENT" } });
  const old = await prisma.document.create({ data: { clientId: client.id, type: "GOVERNMENT_ID", category: "IDENTITY",
    status: "EXPIRED", uploadedAt: new Date("2024-01-01T00:00:00.000Z"), expiryDate: new Date("2025-01-01T00:00:00.000Z") } });
  const invalid = await prisma.document.create({ data: { clientId: client.id, type: "GOVERNMENT_ID", category: "IDENTITY",
    status: "PENDING_REVIEW", uploadedAt: new Date("2026-09-29T10:00:00.000Z"), expiryDate: new Date("2026-01-01T00:00:00.000Z") } });
  const valid = await prisma.document.create({ data: { clientId: client.id, type: "GOVERNMENT_ID", category: "IDENTITY",
    status: "PENDING_REVIEW", uploadedAt: new Date("2026-09-29T10:00:00.000Z"), expiryDate: new Date("2027-09-29T00:00:00.000Z") } });
  const vault = new VaultService({ clientId: client.id, now: new Date("2026-09-29T12:00:00.000Z") });
  const tool = buildMarkResolved(vault) as unknown as { execute(input: object): Promise<{ success: boolean }> };
  await assert.rejects(tool.execute({ documentId: invalid.id,
    reasoning: "An expired replacement document cannot close the original compliance issue." }), /EXPIRED/);
  assert.equal((await prisma.document.findUniqueOrThrow({ where: { id: old.id } })).status, "EXPIRED");
  const result = await tool.execute({ documentId: valid.id,
    reasoning: "A newly uploaded current government ID passes deterministic validation and replaces the expired record." });
  assert.equal(result.success, true);
  const [oldAfter, invalidAfter, validAfter] = await Promise.all([old.id, invalid.id, valid.id].map((id) =>
    prisma.document.findUniqueOrThrow({ where: { id } })));
  assert.equal(oldAfter.status, "SUPERSEDED");
  assert.equal(invalidAfter.status, "SUPERSEDED");
  assert.equal(validAfter.status, "VALID");
  const scorecard = await getComplianceScorecard(vault);
  assert(scorecard.documents.some((document) => document.documentId === valid.id && document.status === "VALID"));
  assert(!scorecard.documents.some((document) => document.documentId === old.id));
  assert.equal(await prisma.agentAction.count({ where: { clientId: client.id, actionType: "MARK_RESOLVED",
    documentId: valid.id, outcome: "STATUS_UPDATED_TO_VALID" } }), 1);
  console.log(JSON.stringify({ ok: true, clientId: client.id, old: oldAfter.status,
    invalid: invalidAfter.status, replacement: validAfter.status, scorecardExpired: scorecard.summary.expiredCount }));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await prisma.$disconnect();
});
