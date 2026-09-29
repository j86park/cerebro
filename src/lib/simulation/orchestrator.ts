import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { VaultService } from "@/lib/db/vault-service";
import { SeededRandom, EntityFactory } from "./factory";
import { MockAgent } from "./mock-agent";
import { executeMockDecision } from "./action-executor";
import { getComplianceAgent } from "@/agents/compliance/agent";
import { getOnboardingAgent } from "@/agents/onboarding/agent";
import { buildSharedTools } from "@/tools/shared";
import { buildComplianceTools } from "@/tools/compliance";
import { buildOnboardingTools } from "@/tools/onboarding";
import { buildClientMemoryScope } from "@/lib/queue/clientMemory";
import { getAgentMaxSteps } from "@/lib/config";
import { ensureMastraStorageInitialized } from "@/lib/mastra-postgres";
import { queues } from "@/lib/queue/client";
import { processHitlResumeFromEscalation } from "@/lib/hitl/resume";

export const SIMULATION_CLIENT_BATCH_SIZE = 100;

export interface SimulationParams {
  clientCount: number;
  simulatedDays: number;
  clientResponseRate: number;
  advisorResponseRate: number;
  randomSeed?: string;
  useMockAgents?: boolean;
}

export class SimulationOrchestrator {
  private mockAgent = new MockAgent();

  async createSimulationRun(params: SimulationParams) {
    const run = await prisma.simulationRun.create({
      data: {
        clientCount: params.clientCount,
        simulatedDays: params.simulatedDays,
        clientResponseRate: params.clientResponseRate,
        advisorResponseRate: params.advisorResponseRate,
        randomSeed: params.randomSeed || Math.random().toString(36).substring(7),
        status: "PENDING",
        metrics: { useMockAgents: params.useMockAgents ?? true } as Prisma.InputJsonValue,
      },
    });
    return run;
  }

  async incrementProgress(runId: string) {
    const run = await prisma.simulationRun.update({
      where: { id: runId },
      data: { batchesCompleted: { increment: 1 }, status: "RUNNING" },
    });
    if (run.batchesTotal > 0 && run.batchesCompleted >= run.batchesTotal) {
      await prisma.simulationRun.updateMany({
        where: { id: runId, status: "RUNNING" },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
      await this.aggregateMetrics(runId);
    }
    return this.getRun(runId);
  }

  /** Records a batch once, so BullMQ retries cannot advance progress twice. */
  async isBatchComplete(runId: string, batchStart: number, clientStart: number) {
    return !!(await prisma.simulationBatchCompletion.findUnique({
      where: { runId_batchStart_clientStart: { runId, batchStart, clientStart } },
    }));
  }

  /** Day barrier: enqueue the next day only after every client chunk for this day committed. */
  async enqueueNextDay(runId: string, currentDay: number) {
    const run = await this.getRun(runId);
    if (!run || run.status === "FAILED" || run.status === "COMPLETED") return 0;
    const chunks = Math.ceil(run.clientCount / SIMULATION_CLIENT_BATCH_SIZE);
    const completed = await prisma.simulationBatchCompletion.count({ where: { runId, batchStart: currentDay } });
    if (completed < chunks || currentDay + 1 >= run.simulatedDays) return 0;
    let enqueued = 0;
    for (let clientStart = 0; clientStart < run.clientCount; clientStart += SIMULATION_CLIENT_BATCH_SIZE) {
      const nextDay = currentDay + 1;
      const jobId = `simulation-${runId}-${nextDay}-${clientStart}`;
      await queues.simulation.add(jobId, { runId, batchStart: nextDay, batchEnd: nextDay,
        clientStart, clientEnd: Math.min(clientStart + SIMULATION_CLIENT_BATCH_SIZE, run.clientCount) },
      { jobId, attempts: 3 });
      enqueued++;
    }
    return enqueued;
  }

  async completeBatch(runId: string, batchStart: number, clientStart: number) {
    const result = await prisma.$transaction(async (tx) => {
      const run = await tx.simulationRun.findUniqueOrThrow({ where: { id: runId } });
      if (run.status === "FAILED") throw new Error(`Simulation run ${runId} failed`);
      const inserted = await tx.simulationBatchCompletion.createMany({
        data: [{ runId, batchStart, clientStart }],
        skipDuplicates: true,
      });
      if (!inserted.count) return { completed: false, run };
      const updated = await tx.simulationRun.update({
        where: { id: runId },
        data: { batchesCompleted: { increment: 1 }, status: "RUNNING" },
      });
      return { completed: true, run: updated };
    });
    if (result.completed && result.run.batchesTotal > 0 &&
        result.run.batchesCompleted >= result.run.batchesTotal) {
      await prisma.simulationRun.updateMany({
        where: { id: runId, status: "RUNNING" },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
    }
    return result;
  }

  async getRun(runId: string) {
    return await prisma.simulationRun.findUnique({
      where: { id: runId },
    });
  }

  async getRecentRuns(limit: number = 10) {
    return await prisma.simulationRun.findMany({
      take: limit,
      orderBy: { startedAt: 'desc' },
    });
  }

  /**
   * Advances the simulation for a specific batch of clients.
   * Calculates simulated date and triggers deterministic document events.
   */
  async tick(runId: string, currentDay: number, clientRange?: { start: number; end: number }) {
    const run = await this.getRun(runId);
    if (!run) throw new Error(`Simulation run ${runId} not found`);
    if (run.status === "FAILED" || run.status === "COMPLETED") {
      throw new Error(`Simulation run ${runId} is ${run.status}; refusing stale batch`);
    }

    const baseDate = new Date(run.startedAt);
    const simDate = new Date(baseDate.getTime() + currentDay * 24 * 60 * 60 * 1000);

    // Fetch batch of clients
    const clients = await prisma.client.findMany({
      where: { simulationRunId: runId },
      skip: clientRange?.start ?? 0,
      take: clientRange ? (clientRange.end - clientRange.start) : run.clientCount,
      orderBy: { id: 'asc' },
    });

    console.log(`[Orchestrator] Run ${runId} | Day ${currentDay} | Clients found: ${clients.length} (range: ${clientRange?.start}-${clientRange?.end})`);

    if (clients.length === 0) {
      console.warn(`[Orchestrator] No clients found for run ${runId} on day ${currentDay}`);
      return { simDate, clientCount: 0, eventsTriggered: 0 };
    }

    let eventsTriggered = 0;

    const metricsJson =
      run.metrics && typeof run.metrics === "object" && !Array.isArray(run.metrics)
        ? (run.metrics as { useMockAgents?: boolean })
        : {};
    const useMock = !!metricsJson.useMockAgents;
    let complianceAgent: Awaited<ReturnType<typeof getComplianceAgent>> | null =
      null;
    let onboardingAgent: Awaited<ReturnType<typeof getOnboardingAgent>> | null =
      null;
    if (!useMock) {
      await ensureMastraStorageInitialized();
      [complianceAgent, onboardingAgent] = await Promise.all([
        getComplianceAgent(),
        getOnboardingAgent(),
      ]);
    }

    for (const client of clients) {
      const clientIndex = client.email.match(/-(\d+)@example\.com$/)?.[1] ?? client.id;
      const rng = new SeededRandom(`${run.randomSeed}-day-${currentDay}-client-${clientIndex}`);
      const requested = await prisma.document.findFirst({
        where: { clientId: client.id, status: "REQUESTED" },
        orderBy: { type: "asc" },
      });
      const received = !!requested && rng.next() < run.clientResponseRate;
      if (received) {
        await prisma.document.update({ where: { id: requested.id }, data: {
          status: "PENDING_REVIEW", uploadedAt: simDate,
          expiryDate: new Date(simDate.getTime() + 365 * 24 * 60 * 60 * 1000),
        } });
        eventsTriggered++;
      }
      const trigger = received ? "EVENT_UPLOAD" : "SCHEDULED";

      // 2. Real/Mock Agent Integration
      const vault = new VaultService({ clientId: client.id, now: simDate });
      
      if (useMock) {
        const pending = (await vault.getEscalationStates({ openOnly: true }) as Array<{
          status: string; openKey: string | null;
        }>).find((state) => state.status === "PENDING_APPROVAL" && state.openKey);
        if (pending?.openKey && rng.next() < run.advisorResponseRate) {
          await processHitlResumeFromEscalation({ vault, clientId: client.id,
            openKey: pending.openKey, decision: "approve", advisorId: client.advisorId,
            resumeWorkflow: async () => ({ status: "completed" }),
          });
          eventsTriggered++;
        }
        const compDec = await this.mockAgent.decide(vault, "COMPLIANCE", trigger);
        await executeMockDecision(vault, "COMPLIANCE", compDec);

        for (let step = 0; step < 3; step++) {
          const onbDec = await this.mockAgent.decide(vault, "ONBOARDING", step === 0 ? trigger : "SCHEDULED");
          const result = await executeMockDecision(vault, "ONBOARDING", onbDec);
          if (!result.followUp) break;
        }
      } else {
        // Real Mastra Agents (High Fidelity)
        console.log(`[Orchestrator] Executing REAL agents for client ${client.id} (Day ${currentDay})...`);
        const memory = buildClientMemoryScope(client.id);

        // Compliance
        await complianceAgent!.generate(`Process current vault state for client ${client.id}. Current simulation date is ${simDate.toISOString()}.`, {
          memory,
          toolsets: {
            shared: buildSharedTools(vault, { agentType: "COMPLIANCE" }),
            compliance: buildComplianceTools(vault),
          },
          maxSteps: getAgentMaxSteps(),
        });

        // Onboarding
        await onboardingAgent!.generate(`Determine onboarding progress for client ${client.id}. Current simulation date is ${simDate.toISOString()}.`, {
          memory,
          toolsets: {
            shared: buildSharedTools(vault, { agentType: "ONBOARDING" }),
            onboarding: buildOnboardingTools(vault),
          },
          maxSteps: getAgentMaxSteps(),
        });
      }
    }
    
    return { simDate, clientCount: clients.length, eventsTriggered };
  }

  async aggregateMetrics(runId: string) {
    const run = await this.getRun(runId);
    if (!run) return;

    const documentStats = await prisma.document.groupBy({
      by: ['status'],
      where: { client: { simulationRunId: runId } },
      _count: true,
    });

    const actionHistory = await prisma.agentAction.count({
      where: { 
        trigger: { in: ['SCHEDULED', 'EVENT_UPLOAD', 'SIMULATION'] }, 
        client: { simulationRunId: runId },
        performedAt: { gte: new Date(run.startedAt) }
      }
    });
    const scope = { client: { simulationRunId: runId } };
    const [completedOnboarding, unresolvedClientRows, actionCounts, activeEscalations] = await Promise.all([
      prisma.agentAction.groupBy({ by: ["clientId"], where: { ...scope,
        actionType: "COMPLETE_ONBOARDING", outcome: "ONBOARDING_COMPLETED" } }),
      prisma.document.groupBy({ by: ["clientId"], where: { ...scope, status: { notIn: ["VALID", "SUPERSEDED"] } } }),
      prisma.agentAction.groupBy({ by: ["actionType"], where: { ...scope,
        outcome: { notIn: ["POLICY_BLOCKED", "PENDING_APPROVAL"] } }, _count: true }),
      prisma.escalationState.count({ where: { ...scope, status: { in: ["OPEN", "PENDING_APPROVAL", "SAFE_HOLD"] } } }),
    ]);
    const actionCount = (type: string) => actionCounts.find((row) => row.actionType === type)?._count ?? 0;
    const documentsNeedingAttention = documentStats.filter((row) => row.status !== "VALID" && row.status !== "SUPERSEDED")
      .reduce((sum, row) => sum + row._count, 0);

    const baseMetrics =
      run.metrics &&
      typeof run.metrics === "object" &&
      run.metrics !== null &&
      !Array.isArray(run.metrics)
        ? (run.metrics as Record<string, unknown>)
        : {};
    const metrics: Prisma.InputJsonObject = {
      ...baseMetrics,
      documentStatusDistribution: documentStats,
      totalActionsTriggered: actionHistory,
      simulatedDaysProcessed: Math.floor(run.batchesCompleted / Math.ceil(run.clientCount / SIMULATION_CLIENT_BATCH_SIZE)),
      onboardingCompletedByAgent: completedOnboarding.length,
      clientsWithUnresolvedDocuments: unresolvedClientRows.length,
      documentsNeedingAttention,
      activeEscalations,
      advisorAlerts: actionCount("NOTIFY_ADVISOR"),
      clientReminders: actionCount("SEND_CLIENT_REMINDER"),
      complianceOfficerEscalations: actionCount("ESCALATE_COMPLIANCE"),
      managementEscalations: actionCount("ESCALATE_MANAGEMENT"),
    };

    await prisma.simulationRun.update({
      where: { id: runId },
      data: { metrics: metrics as Prisma.InputJsonValue },
    });

    return metrics;
  }

  async seedSimulationClients(count: number, runId: string) {
    if (!Number.isInteger(count) || count < 1) throw new Error("client count must be a positive integer");
    const run = await this.getRun(runId);
    if (!run) throw new Error(`Simulation run ${runId} not found`);
    if (count !== run.clientCount) throw new Error(`Simulation run ${runId} expects ${run.clientCount} clients`);

    // Reserved synthetic foundation. It never modifies demo firms/advisors.
    await prisma.firm.upsert({
      where: { id: "CEREBRO-SIM-FIRM" },
      create: { id: "CEREBRO-SIM-FIRM", name: "Cerebro simulation" },
      update: {},
    });
    await prisma.advisor.upsert({
      where: { id: "CEREBRO-SIM-ADVISOR" },
      create: {
        id: "CEREBRO-SIM-ADVISOR",
        firmId: "CEREBRO-SIM-FIRM",
        name: "Simulation Advisor",
        email: "cerebro-simulation-advisor@invalid.example",
      },
      update: {},
    });

    const factory = new EntityFactory(run.randomSeed);
    const batchSize = 1000;
    for (let start = 0; start < count; start += batchSize) {
      const candidates = factory.generateClients(Math.min(batchSize, count - start), start);
      await prisma.client.createMany({
        data: candidates.map((client, index) => ({
          ...client,
          ...((start + index) % 3 === 2
            ? { onboardingStage: 4, onboardingStatus: "COMPLETED" as const }
            : {}),
          email: `sim-${runId}-${start + index}@example.com`,
          firmId: "CEREBRO-SIM-FIRM",
          advisorId: "CEREBRO-SIM-ADVISOR",
          simulationRunId: runId,
        })),
        skipDuplicates: true,
      });
    }
    const seeded = await prisma.client.count({ where: { simulationRunId: runId } });
    if (seeded !== count) throw new Error(`Simulation run ${runId} seeded ${seeded}/${count} clients`);
    for (let start = 0; start < count; start += batchSize) {
      const clients = await prisma.client.findMany({
        where: { simulationRunId: runId, email: { startsWith: `sim-${runId}-` } },
        select: { id: true, email: true },
        skip: start, take: Math.min(batchSize, count - start), orderBy: { email: "asc" },
      });
      const documents = clients.flatMap((client) => {
        const index = Number(client.email.match(/-(\d+)@example\.com$/)?.[1] ?? 0);
        const profile = index % 3 === 0 ? "IDEAL" : index % 3 === 1 ? "MESSY" : "HIGH_RISK";
        const factory = new EntityFactory(`${run.randomSeed}-client-${index}`, new Date(run.startedAt));
        return factory.generateDocuments(client.id, profile).map((document) => ({
          ...document, id: `${client.id}-${document.type}`,
        } as Prisma.DocumentCreateManyInput));
      });
      if (documents.length) await prisma.document.createMany({ data: documents, skipDuplicates: true });
    }
    return { count: seeded };
  }

  /** Deletes only artifacts owned by the named run. Callers must retire its jobs first. */
  async purgeSimulationData(runId: string) {
    if (!runId) throw new Error("simulation run id is required for purge");
    const scope = { client: { simulationRunId: runId } };
    return prisma.$transaction(async (tx) => {
      await tx.decisionRecord.deleteMany({ where: scope });
      await tx.escalationState.deleteMany({ where: scope });
      await tx.onboardingStage.deleteMany({ where: scope });
      const actions = await tx.agentAction.deleteMany({ where: scope });
      const docs = await tx.document.deleteMany({ where: scope });
      const clients = await tx.client.deleteMany({ where: { simulationRunId: runId } });
      return { purgedDocuments: docs.count, purgedClients: clients.count, purgedActions: actions.count };
    });
  }
}
