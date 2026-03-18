import { prisma } from "@/lib/db/client";
import { VaultService } from "@/lib/db/vault-service";
import { DocumentStatus } from "@/lib/db/enums";
import { SeededRandom, EntityFactory } from "./factory";
import { MockAgent } from "./mock-agent";
import { DOCUMENT_REGISTRY } from "@/lib/documents/registry";

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
        metrics: { useMockAgents: params.useMockAgents || false } as any
      },
    });
    return run;
  }

  async updateProgress(
    runId: string,
    { batchesCompleted, batchesTotal }: { batchesCompleted: number; batchesTotal: number }
  ) {
    const isCompleted = batchesCompleted >= batchesTotal;
    
    const data: any = {
      batchesCompleted,
      batchesTotal,
      status: isCompleted ? "COMPLETED" : "RUNNING",
    };

    if (isCompleted) {
      data.completedAt = new Date();
    }

    return await prisma.simulationRun.update({
      where: { id: runId },
      data,
    });
  }

  async getRun(runId: string) {
    return await prisma.simulationRun.findUnique({
      where: { id: runId },
    });
  }

  /**
   * Advances the simulation for a specific batch of clients.
   * Calculates simulated date and triggers deterministic document events.
   */
  async tick(runId: string, currentDay: number, clientRange?: { start: number; end: number }) {
    const run = await this.getRun(runId);
    if (!run) throw new Error(`Simulation run ${runId} not found`);

    const baseDate = new Date(run.startedAt);
    const simDate = new Date(baseDate.getTime() + currentDay * 24 * 60 * 60 * 1000);

    // Fetch batch of clients
    const clients = await prisma.client.findMany({
      where: { email: { endsWith: "@example.com" } },
      skip: clientRange?.start ?? 0,
      take: clientRange ? (clientRange.end - clientRange.start) : run.clientCount,
      orderBy: { id: 'asc' },
    });

    console.log(`[Orchestrator] Ticking Day ${currentDay} for ${clients.length} clients`);

    const rng = new SeededRandom(`${run.randomSeed}-day-${currentDay}`);
    const factory = new EntityFactory(run.randomSeed, simDate);
    const newDocs: any[] = [];
    
    for (const client of clients) {
      const trigger: any = rng.next() < 0.05 ? "EVENT_UPLOAD" : "SCHEDULED";
      
      // 1. Document Events
      if (trigger === "EVENT_UPLOAD") {
        const profile = (client as any).profile || "MESSY";
        const docs = factory.generateDocuments(client.id, profile as any).slice(0, 1);
        
        if (docs.length > 0) {
          newDocs.push({
            ...docs[0],
            id: `${client.id}-SIM-${currentDay}`,
            status: "PENDING_REVIEW",
            uploadedAt: simDate,
          });
        }
      }

      // 2. Mock Agent Integration (if enabled)
      if (run.metrics && (run.metrics as any).useMockAgents) {
        const vault = new VaultService({ clientId: client.id });
        
        // Compliance
        const compDec = await this.mockAgent.decide(vault, "COMPLIANCE", trigger);
        if (compDec.actionTaken !== "SCAN_VAULT") {
            await vault.logAction({
                agentType: "COMPLIANCE",
                actionType: compDec.actionTaken,
                trigger,
                reasoning: compDec.reasoning,
                escalationStage: compDec.escalationStage,
                performedAt: simDate,
            } as any);
        }

        // Onboarding
        const onbDec = await this.mockAgent.decide(vault, "ONBOARDING", trigger);
        if (onbDec.actionTaken !== "SCAN_VAULT" && onbDec.actionTaken !== "ADVANCE_STAGE") {
            await vault.logAction({
                agentType: "ONBOARDING",
                actionType: onbDec.actionTaken,
                trigger,
                reasoning: onbDec.reasoning,
                onboardingStage: onbDec.onboardingStage,
                performedAt: simDate,
            } as any);
        }
      }
    }
    
    if (newDocs.length > 0) {
      await prisma.document.createMany({
        data: newDocs,
        skipDuplicates: true,
      });
    }
    
    return { simDate, clientCount: clients.length, eventsTriggered: newDocs.length };
  }

  async aggregateMetrics(runId: string) {
    const run = await this.getRun(runId);
    if (!run) return;

    const documentStats = await prisma.document.groupBy({
      by: ['status'],
      where: { client: { email: { endsWith: "@example.com" } } },
      _count: true,
    });

    const actionHistory = await prisma.agentAction.count({
      where: { trigger: { in: ['SCHEDULED', 'EVENT_UPLOAD'] }, client: { email: { endsWith: "@example.com" } } }
    });

    const metrics = {
      ... (run.metrics as any || {}),
      documentStatusDistribution: documentStats,
      totalActionsTriggered: actionHistory,
      simulatedDaysProcessed: run.batchesCompleted,
    };

    await prisma.simulationRun.update({
      where: { id: runId },
      data: { metrics: metrics as any }
    });

    return metrics;
  }

  async seedSimulationClients(count: number, randomSeed?: string) {
    console.log(`[Orchestrator] Seeding ${count} simulation clients...`);
    const seed = randomSeed || Math.random().toString(36).substring(7);
    const factory = new EntityFactory(seed);
    
    const batchSize = 1000;
    const totalBatches = Math.ceil(count / batchSize);
    
    for (let i = 0; i < totalBatches; i++) {
        const take = Math.min(batchSize, count - i * batchSize);
        const clients = factory.generateClients(take, i * batchSize).map(c => ({
            ...c,
            advisorId: "ADV-001",
            firmId: "FIRM-001",
        }));
        
        await prisma.client.createMany({
            data: clients
        });
        
        console.log(`[Orchestrator] Seeded batch ${i+1}/${totalBatches} (${take} clients)`);
    }
    
    return { count };
  }

  async purgeSimulationData() {
    console.log("[Orchestrator] Purging simulation data...");
    
    const docs = await prisma.document.deleteMany({
      where: {
        OR: [
          { client: { email: { endsWith: "@example.com" } } },
          { id: { contains: "-SIM-" } }
        ]
      }
    });

    const actions = await prisma.agentAction.deleteMany({
        where: { client: { email: { endsWith: "@example.com" } } }
    });

    const clients = await prisma.client.deleteMany({
      where: { email: { endsWith: "@example.com" } }
    });

    return { purgedDocuments: docs.count, purgedClients: clients.count, purgedActions: actions.count };
  }
}
