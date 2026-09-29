import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { VaultService } from "@/lib/db/vault-service";
import { SeededRandom, EntityFactory, type ClientProfile } from "./factory";
import { MockAgent } from "./mock-agent";
import { getComplianceAgent } from "@/agents/compliance/agent";
import { getOnboardingAgent } from "@/agents/onboarding/agent";
import { buildSharedTools } from "@/tools/shared";
import { buildComplianceTools } from "@/tools/compliance";
import { buildOnboardingTools } from "@/tools/onboarding";
import { buildClientMemoryScope } from "@/lib/queue/clientMemory";
import { getAgentMaxSteps } from "@/lib/config";
import { ensureMastraStorageInitialized } from "@/lib/mastra-postgres";

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

    const rng = new SeededRandom(`${run.randomSeed}-day-${currentDay}`);
    const factory = new EntityFactory(run.randomSeed, simDate);
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
      const trigger = rng.next() < 0.05 ? "EVENT_UPLOAD" : "SCHEDULED";

      // 1. Document Events
      if (trigger === "EVENT_UPLOAD") {
        const rawProfile = (client as { profile?: string }).profile;
        const profile: ClientProfile =
          rawProfile === "IDEAL" || rawProfile === "MESSY" || rawProfile === "HIGH_RISK"
            ? rawProfile
            : "MESSY";
        const docs = factory.generateDocuments(client.id, profile).slice(0, 1);
        
        if (docs.length > 0) {
          const inserted = await prisma.document.createMany({
            data: [{
            ...docs[0],
            id: `${client.id}-SIM-${currentDay}`,
            status: "PENDING_REVIEW",
            uploadedAt: simDate,
            } as Prisma.DocumentCreateManyInput],
            skipDuplicates: true,
          });
          eventsTriggered += inserted.count;
        }
      }

      // 2. Real/Mock Agent Integration
      const vault = new VaultService({ clientId: client.id });
      
      if (useMock) {
        // Compliance (Mock)
        const compDec = await this.mockAgent.decide(vault, "COMPLIANCE", trigger);
        await vault.logAction({
          agentType: "COMPLIANCE",
          actionType: compDec.actionTaken,
          trigger,
          reasoning: compDec.reasoning,
        });

        // Onboarding (Mock)
        const onbDec = await this.mockAgent.decide(vault, "ONBOARDING", trigger);
        await vault.logAction({
          agentType: "ONBOARDING",
          actionType: onbDec.actionTaken,
          trigger,
          reasoning: onbDec.reasoning,
        });
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
      simulatedDaysProcessed: run.batchesCompleted,
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
