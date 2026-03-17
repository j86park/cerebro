import { prisma } from "@/lib/db/client";
import { SeededRandom, EntityFactory } from "./factory";

export interface SimulationParams {
  clientCount: number;
  simulatedDays: number;
  clientResponseRate: number;
  advisorResponseRate: number;
  randomSeed?: string;
}

export class SimulationOrchestrator {
  async createSimulationRun(params: SimulationParams) {
    const run = await prisma.simulationRun.create({
      data: {
        clientCount: params.clientCount,
        simulatedDays: params.simulatedDays,
        clientResponseRate: params.clientResponseRate,
        advisorResponseRate: params.advisorResponseRate,
        randomSeed: params.randomSeed || Math.random().toString(36).substring(7),
        status: "PENDING",
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
    let eventsTriggered = 0;
    
    for (const client of clients) {
      if (rng.next() < 0.05) {
        eventsTriggered++;
        // Create a simulated document upload event
        const factory = new EntityFactory(run.randomSeed, simDate);
        const docs = factory.generateDocuments(client.id, "MESSY").slice(0, 1);
        
        if (docs.length > 0) {
          await prisma.document.upsert({
            where: { id: `${client.id}-SIM-${currentDay}` },
            create: {
              ...docs[0],
              id: `${client.id}-SIM-${currentDay}`,
              status: "PENDING_REVIEW",
              uploadedAt: simDate,
            },
            update: {
              status: "PENDING_REVIEW",
              uploadedAt: simDate,
            }
          });
        }
      }
    }
    
    return { simDate, clientCount: clients.length, eventsTriggered };
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
      where: { trigger: 'SIMULATION' }
    });

    const metrics = {
      documentStatusDistribution: documentStats,
      totalActionsTriggered: actionHistory,
      simulatedDaysProcessed: run.batchesCompleted, // In our day-based batching
    };

    await prisma.simulationRun.update({
      where: { id: runId },
      data: { metrics: metrics as any }
    });

    return metrics;
  }

  /**
   * Purges all simulation data (clients and documents) to prevent DB bloat.
   * Safety: Only deletes clients with @example.com email.
   */
  async purgeSimulationData() {
    console.log("[Orchestrator] Purging simulation data...");
    
    // 1. Delete simulation documents first (foreign key)
    const docs = await prisma.document.deleteMany({
      where: {
        OR: [
          { client: { email: { endsWith: "@example.com" } } },
          { id: { contains: "-SIM-" } }
        ]
      }
    });

    // 2. Delete simulation clients
    const clients = await prisma.client.deleteMany({
      where: { email: { endsWith: "@example.com" } }
    });

    return { purgedDocuments: docs.count, purgedClients: clients.count };
  }
}
