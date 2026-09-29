import assert from "node:assert/strict";
import { prisma } from "@/lib/db/client";
import { connection, queues } from "@/lib/queue/client";
import { VaultService } from "@/lib/db/vault-service";
import { processHitlResumeFromEscalation } from "@/lib/hitl/resume";

// This script invokes the production processor directly; it must not start
// the background BullMQ workers that the worker module normally constructs.
process.env.VITEST = "true";

const MAX_LIVE_INPUT_TOKENS = 75_000;

function assertModelDecision(metadata: unknown, label: string, expectedOutcome: string) {
  assert(metadata && typeof metadata === "object" && !Array.isArray(metadata), `${label}: missing decision metadata`);
  const observed = metadata as { inputTokens?: unknown; workflowOutcome?: unknown };
  assert(typeof observed.inputTokens === "number" && observed.inputTokens <= MAX_LIVE_INPUT_TOKENS,
    `${label}: input token count ${String(observed.inputTokens)} exceeds ${MAX_LIVE_INPUT_TOKENS}`);
  assert.equal(observed.workflowOutcome, expectedOutcome, `${label}: unexpected workflow outcome`);
}

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
    select: { outcome: true, toolExecuted: true, metadata: true },
  });
  assertModelDecision(decisions.find((decision) => decision.outcome === "DRY_RUN")?.metadata,
    `${agentType.toLowerCase()} initial`, "ACTION_TAKEN");
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
  if (process.argv.includes("--replacement-resolution-seeded")) {
    const client = await createClient("Replacement resolution seeded");
    const old = await prisma.document.create({ data: {
      clientId: client.id, type: "GOVERNMENT_ID", category: "IDENTITY", status: "EXPIRED",
      uploadedAt: new Date("2024-01-01T00:00:00.000Z"), expiryDate: new Date("2025-01-01T00:00:00.000Z"),
    } });
    const replacement = await prisma.document.create({ data: {
      clientId: client.id, type: "GOVERNMENT_ID", category: "IDENTITY", status: "PENDING_REVIEW",
      uploadedAt: new Date("2026-09-29T10:00:00.000Z"), expiryDate: new Date("2027-09-29T12:00:00.000Z"),
      notes: "Synthetic replacement government ID uploaded for expired prior ID. Expiry 2027-09-29.",
    } });
    const { processAgentJob } = await import("@/lib/queue/workers");
    const result = await processAgentJob({ id: `verify-replacement-${client.id}`, data: {
      clientId: client.id, agentType: "COMPLIANCE", trigger: "EVENT_UPLOAD",
      documentId: replacement.id, effectiveAt: "2026-09-29T12:00:00.000Z",
    } } as never);
    const [oldAfter, replacementAfter] = await Promise.all([old.id, replacement.id].map((id) =>
      prisma.document.findUniqueOrThrow({ where: { id } })));
    const actions = await prisma.agentAction.findMany({ where: { clientId: client.id },
      select: { actionType: true, outcome: true, documentId: true } });
    const decision = await prisma.decisionRecord.findFirst({ where: { clientId: client.id, outcome: "DRY_RUN" },
      orderBy: { decidedAt: "desc" }, select: { toolExecuted: true, metadata: true } });
    assertModelDecision(decision?.metadata, "replacement resolution", "COMPLETED");
    console.log(JSON.stringify({ clientId: client.id, jobSuccess: result.success, old: oldAfter.status,
      replacement: replacementAfter.status, actions, tools: decision?.toolExecuted, metadata: decision?.metadata }));
    assert.equal(result.success, true);
    assert.equal(oldAfter.status, "SUPERSEDED");
    assert.equal(replacementAfter.status, "VALID");
    assert(actions.some((action) => action.actionType === "MARK_RESOLVED"
      && action.documentId === replacement.id && action.outcome === "STATUS_UPDATED_TO_VALID"));
    return;
  }
  if (process.argv.includes("--stage3-to-stage4-seeded")) {
    const client = await createClient("Stage 3 to Stage 4 seeded");
    const document = await prisma.document.create({ data: {
      id: `${client.id}-GOVERNMENT_ID`, clientId: client.id, type: "GOVERNMENT_ID",
      category: "IDENTITY", status: "EXPIRED", notificationCount: 1,
      lastNotifiedAt: new Date("2026-10-05T12:00:00.000Z"),
      expiryDate: new Date("2025-01-01T00:00:00.000Z"),
    } });
    await prisma.agentAction.createMany({ data: [
      { clientId: client.id, documentId: document.id, agentType: "COMPLIANCE", actionType: "NOTIFY_ADVISOR",
        trigger: "SIMULATION", reasoning: "Synthetic initial advisor alert for the expired government ID.",
        outcome: "DRY_RUN", stage: 1, effectiveAt: new Date("2026-09-29T12:00:00.000Z") },
      { clientId: client.id, documentId: document.id, agentType: "COMPLIANCE", actionType: "SEND_CLIENT_REMINDER",
        trigger: "SIMULATION", reasoning: "Synthetic first client reminder after the five-day threshold.",
        outcome: "DRY_RUN", stage: 2, effectiveAt: new Date("2026-10-05T12:00:00.000Z") },
    ] });
    const { processAgentJob } = await import("@/lib/queue/workers");
    const stages = [];
    for (const [stage, effectiveAt] of [[3, "2026-10-11T12:00:00.000Z"], [4, "2026-10-20T12:00:00.000Z"]] as const) {
      const result = await processAgentJob({ id: `verify-stage${stage}-seeded-${client.id}`, data: {
        clientId: client.id, agentType: "COMPLIANCE", trigger: "SCHEDULED", effectiveAt,
      } } as never);
      assert.equal(result.success, true);
      const actions = await prisma.agentAction.findMany({ where: { clientId: client.id, stage },
        select: { actionType: true, outcome: true } });
      const decision = await prisma.decisionRecord.findFirst({ where: { clientId: client.id, outcome: "DRY_RUN" },
        orderBy: { decidedAt: "desc" }, select: { toolExecuted: true, metadata: true } });
      assertModelDecision(decision?.metadata, `compliance stage ${stage}`,
        stage === 3 ? "ACTION_TAKEN" : "WAITING_FOR_APPROVAL");
      stages.push({ stage, actions, tools: decision?.toolExecuted, metadata: decision?.metadata });
      if (stage === 3) {
        assert(actions.some((row) => row.actionType === "NOTIFY_ADVISOR" && row.outcome === "DRY_RUN"));
        assert(actions.some((row) => row.actionType === "SEND_CLIENT_REMINDER" && row.outcome === "DRY_RUN"));
        const after = await prisma.document.findUniqueOrThrow({ where: { id: document.id } });
        assert.equal(after.status, "EXPIRED");
        assert.equal(after.notificationCount, 2);
      } else {
        assert(actions.some((row) => row.actionType === "ESCALATE_COMPLIANCE"
          && ["PENDING_APPROVAL", "HITL_SUSPENDED"].includes(row.outcome ?? "")));
        assert(await prisma.escalationState.findFirst({ where: { clientId: client.id,
          ladderStage: 4, status: "PENDING_APPROVAL" } }));
      }
    }
    console.log(JSON.stringify({ ok: true, clientId: client.id, status: "EXPIRED", stages }));
    return;
  }
  if (process.argv.includes("--onboarding-seeded")) {
    const client = await createClient("Seeded onboarding completion");
    await prisma.client.update({ where: { id: client.id }, data: {
      accountType: "TFSA", onboardingStage: 1, onboardingStatus: "IN_PROGRESS" } });
    const required = [
      ["GOVERNMENT_ID", "IDENTITY"], ["PROOF_OF_ADDRESS", "IDENTITY"], ["SIN_SSN_FORM", "IDENTITY"],
      ["NAAF", "COMPLIANCE"], ["RISK_QUESTIONNAIRE", "SUITABILITY"], ["CLIENT_AGREEMENT", "LEGAL"],
      ["BENEFICIARY_DESIGNATION", "ESTATE"], ["FEE_DISCLOSURE", "LEGAL"],
      ["BANKING_INFORMATION", "FUNDING"], ["DEPOSIT_CONFIRMATION", "FUNDING"],
    ] as const;
    await prisma.document.createMany({ data: required.map(([type, category]) => ({
      id: `${client.id}-${type}`, clientId: client.id, type, category,
      status: "VALID" as const, uploadedAt: new Date("2026-09-28T12:00:00.000Z"),
      expiryDate: new Date("2027-09-28T12:00:00.000Z"),
    })) });
    const { processAgentJob } = await import("@/lib/queue/workers");
    const steps = [];
    for (let day = 0; day < 4; day++) {
      const effectiveAt = new Date(Date.UTC(2026, 8, 29 + day, 12)).toISOString();
      await processAgentJob({ id: `verify-onboarding-seeded-${client.id}-${day}`, data: {
        clientId: client.id, agentType: "ONBOARDING", trigger: "SCHEDULED", effectiveAt,
      } } as never);
      const current = await prisma.client.findUniqueOrThrow({ where: { id: client.id } });
      const latest = await prisma.decisionRecord.findFirst({ where: { clientId: client.id, outcome: "DRY_RUN" },
        orderBy: { decidedAt: "desc" }, select: { toolExecuted: true, metadata: true } });
      assertModelDecision(latest?.metadata, `onboarding day ${day}`,
        current.onboardingStatus === "COMPLETED" ? "COMPLETED" : "ADVANCED");
      steps.push({ effectiveAt, stage: current.onboardingStage, status: current.onboardingStatus,
        tools: latest?.toolExecuted, metadata: latest?.metadata });
      if (current.onboardingStatus === "COMPLETED") break;
    }
    const final = await prisma.client.findUniqueOrThrow({ where: { id: client.id } });
    assert.equal(final.onboardingStatus, "COMPLETED");
    assert.equal(final.onboardingStage, 4);
    console.log(JSON.stringify({ ok: true, clientId: client.id, steps }));
    return;
  }
  if (process.argv.includes("--stage5-seeded")) {
    const client = await createClient("Stage 5 seeded approval");
    const document = await prisma.document.create({ data: {
      id: `${client.id}-GOVERNMENT_ID`, clientId: client.id, type: "GOVERNMENT_ID",
      category: "IDENTITY", status: "EXPIRED", notificationCount: 2,
      lastNotifiedAt: new Date("2026-10-11T12:00:00.000Z"),
      expiryDate: new Date("2025-01-01T00:00:00.000Z"),
    } });
    const history = [
      { actionType: "NOTIFY_ADVISOR" as const, stage: 1, effectiveAt: new Date("2026-09-29T12:00:00.000Z"), outcome: "DRY_RUN", actor: "AGENT" as const, reasonCodes: [] as string[] },
      { actionType: "SEND_CLIENT_REMINDER" as const, stage: 2, effectiveAt: new Date("2026-10-05T12:00:00.000Z"), outcome: "DRY_RUN", actor: "AGENT" as const, reasonCodes: [] as string[] },
      { actionType: "NOTIFY_ADVISOR" as const, stage: 3, effectiveAt: new Date("2026-10-11T12:00:00.000Z"), outcome: "DRY_RUN", actor: "AGENT" as const, reasonCodes: [] as string[] },
      { actionType: "SEND_CLIENT_REMINDER" as const, stage: 3, effectiveAt: new Date("2026-10-11T12:00:00.000Z"), outcome: "DRY_RUN", actor: "AGENT" as const, reasonCodes: [] as string[] },
      { actionType: "ESCALATE_COMPLIANCE" as const, stage: 4, effectiveAt: new Date("2026-10-20T12:00:00.000Z"), outcome: "DRY_RUN", actor: "ADVISOR" as const, reasonCodes: ["HITL_APPROVED"] },
    ];
    await prisma.agentAction.createMany({ data: history.map((row) => ({
      clientId: client.id, documentId: document.id, agentType: "COMPLIANCE" as const,
      trigger: "SIMULATION" as const, reasoning: `Synthetic prior Stage ${row.stage} action for model-backed Stage 5 test.`,
      ...row,
    })) });
    await prisma.escalationState.create({ data: { clientId: client.id, documentId: document.id,
      ladderStage: 4, status: "RESOLVED", reasonCodes: ["HITL_APPROVED"], resolvedAt: new Date() } });
    const { processAgentJob } = await import("@/lib/queue/workers");
    const result = await processAgentJob({ id: `verify-stage5-seeded-${client.id}`, data: {
      clientId: client.id, agentType: "COMPLIANCE", trigger: "SCHEDULED",
      effectiveAt: "2026-10-30T12:00:00.000Z",
    } } as never);
    const pending = await prisma.escalationState.findFirst({ where: { clientId: client.id,
      ladderStage: 5, status: "PENDING_APPROVAL" } });
    const decision = await prisma.decisionRecord.findFirst({ where: { clientId: client.id,
      outcome: "DRY_RUN" }, orderBy: { decidedAt: "desc" }, select: { toolExecuted: true, metadata: true } });
    assertModelDecision(decision?.metadata, "compliance stage 5", "WAITING_FOR_APPROVAL");
    assert(pending, "Stage 5 must request advisor approval");
    console.log(JSON.stringify({ ok: true, clientId: client.id, jobSuccess: result.success,
      stage5Pending: pending.status, toolExecuted: decision?.toolExecuted,
      metadata: decision?.metadata }));
    return;
  }
  const approveArg = process.argv.find((arg) => arg.startsWith("--approve-stage4-client="));
  if (approveArg) {
    const clientId = approveArg.slice("--approve-stage4-client=".length);
    const pending = await prisma.escalationState.findFirstOrThrow({ where: {
      clientId, ladderStage: 4, status: "PENDING_APPROVAL" }, select: { openKey: true } });
    assert(pending.openKey);
    const result = await processHitlResumeFromEscalation({
      vault: new VaultService({ clientId, now: new Date("2026-10-20T12:00:00.000Z") }),
      clientId, openKey: pending.openKey, decision: "approve", advisorId: "CEREBRO-SIM-ADVISOR",
      resumeWorkflow: async () => ({ status: "completed" }),
    });
    assert.equal(result.outcome, "DRY_RUN");
    console.log(JSON.stringify({ ok: true, stage: 4, syntheticAdvisorApproval: result.outcome, clientId }));
    return;
  }
  const ladderArg = process.argv.find((arg) => /^--stage[2345]-client=/.test(arg));
  if (ladderArg) {
    const stage = Number(ladderArg.match(/^--stage(\d)-client=/)?.[1]);
    const clientId = ladderArg.slice(ladderArg.indexOf("=") + 1);
    const effectiveAt = process.argv.find((arg) => arg.startsWith("--effective-at="))?.slice(15) ?? (stage === 2 ? "2026-10-05T12:00:00.000Z"
      : stage === 3 ? "2026-10-10T12:00:00.000Z"
      : stage === 4 ? "2026-10-20T12:00:00.000Z" : "2026-10-30T12:00:00.000Z");
    const document = await prisma.document.findFirstOrThrow({ where: { clientId, type: "GOVERNMENT_ID" } });
    assert.equal(document.status, "EXPIRED");
    const { processAgentJob } = await import("@/lib/queue/workers");
    const result = await processAgentJob({ id: `verify-stage${stage}-${clientId}`, data: {
      clientId, agentType: "COMPLIANCE", trigger: "SCHEDULED",
      effectiveAt,
    } } as never);
    const after = await prisma.document.findUniqueOrThrow({ where: { id: document.id } });
    const reminders = await prisma.agentAction.findMany({ where: { clientId,
      actionType: "SEND_CLIENT_REMINDER" }, select: { outcome: true, stage: true, effectiveAt: true } });
    assert.equal(after.status, "EXPIRED");
    assert.equal(after.notificationCount, stage === 2 ? 1 : stage === 3 ? 2 : 2);
    assert(after.lastNotifiedAt);
    if (stage <= 3) assert(reminders.some((row) => row.stage === stage && row.outcome === "DRY_RUN"));
    const escalation = await prisma.escalationState.findMany({ where: { clientId },
      select: { openKey: true, ladderStage: true, status: true } });
    const decision = await prisma.decisionRecord.findFirst({ where: { clientId, outcome: "DRY_RUN" },
      orderBy: { decidedAt: "desc" }, select: { metadata: true } });
    assertModelDecision(decision?.metadata, `compliance stage ${stage}`,
      stage >= 4 ? "WAITING_FOR_APPROVAL" : "ACTION_TAKEN");
    if (stage >= 4) assert(escalation.some((row) => row.ladderStage === stage && row.status === "PENDING_APPROVAL"));
    console.log(JSON.stringify({ ok: true, stage, clientId, jobSuccess: result.success,
      status: after.status, notificationCount: after.notificationCount,
      lastNotifiedAt: after.lastNotifiedAt, reminders, escalation }));
    return;
  }
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
