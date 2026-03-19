import { prisma } from "@/lib/db/client";
import { VaultService } from "@/lib/db/vault-service";
import { DocumentStatus } from "@/lib/db/enums";
import { SeededRandom, EntityFactory } from "./factory";
import { MockAgent } from "./mock-agent";
import { DOCUMENT_REGISTRY } from "@/lib/documents/registry";
import { complianceAgent } from "@/agents/compliance/agent";
import { onboardingAgent } from "@/agents/onboarding/agent";
import { buildSharedTools } from "@/tools/shared";
import { buildComplianceTools } from "@/tools/compliance";
import { buildOnboardingTools } from "@/tools/onboarding";

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
        metrics: { useMockAgents: params.useMockAgents ?? true } as any
      },
    });
    return run;
  }

  async incrementProgress(runId: string) {
    const run = await this.getRun(runId);
    if (!run) return;

    const batchesCompleted = run.batchesCompleted + 1;
    const isCompleted = batchesCompleted >= run.batchesTotal;
    
    const data: any = {
      batchesCompleted,
      status: isCompleted ? "COMPLETED" : "RUNNING",
    };

    if (isCompleted) {
      data.completedAt = new Date();
      // Final aggregation on completion
      await this.aggregateMetrics(runId);
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

    const baseDate = new Date(run.startedAt);
    const simDate = new Date(baseDate.getTime() + currentDay * 24 * 60 * 60 * 1000);

    // Fetch batch of clients
    const clients = await prisma.client.findMany({
      where: { email: { endsWith: "@example.com" } },
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

      // 2. Real/Mock Agent Integration
      const useMock = !!(run.metrics && (run.metrics as any).useMockAgents);
      const vault = new VaultService({ clientId: client.id });
      
      if (useMock) {
        // Compliance (Mock)
        const compDec = await this.mockAgent.decide(vault, "COMPLIANCE", trigger);
        await vault.logAction({
            agentType: "COMPLIANCE",
            actionType: compDec.actionTaken,
            trigger,
            reasoning: compDec.reasoning,
            escalationStage: compDec.escalationStage,
            performedAt: simDate,
        } as any);

        // Onboarding (Mock)
        const onbDec = await this.mockAgent.decide(vault, "ONBOARDING", trigger);
        await vault.logAction({
            agentType: "ONBOARDING",
            actionType: onbDec.actionTaken,
            trigger,
            reasoning: onbDec.reasoning,
            onboardingStage: onbDec.onboardingStage,
            performedAt: simDate,
        } as any);
      } else {
        // Real Mastra Agents (High Fidelity)
        console.log(`[Orchestrator] Executing REAL agents for client ${client.id} (Day ${currentDay})...`);
        const sharedTools = buildSharedTools(vault);
        
        // Compliance
        await complianceAgent.generate(`Process current vault state for client ${client.id}. Current simulation date is ${simDate.toISOString()}.`, {
          memory: { thread: client.id, resource: client.id },
          toolsets: { shared: sharedTools, compliance: buildComplianceTools(vault) }
        });

        // Onboarding
        await onboardingAgent.generate(`Determine onboarding progress for client ${client.id}. Current simulation date is ${simDate.toISOString()}.`, {
          memory: { thread: client.id, resource: client.id },
          toolsets: { shared: sharedTools, onboarding: buildOnboardingTools(vault) }
        });
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
      where: { 
        trigger: { in: ['SCHEDULED', 'EVENT_UPLOAD', 'SIMULATION'] }, 
        client: { email: { endsWith: "@example.com" } },
        performedAt: { gte: new Date(run.startedAt) }
      }
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
        const candidates = factory.generateClients(take, i * batchSize);
        
        // Filter out existing clients to prevent unique constraint violations
        const candidateEmails = candidates.map(c => c.email);
        const existing = await prisma.client.findMany({
            where: { email: { in: candidateEmails } },
            select: { email: true }
        });
        const existingEmails = new Set(existing.map(e => e.email));
        
        const toCreate = candidates
            .filter(c => !existingEmails.has(c.email))
            .map(c => ({
                ...c,
                advisorId: "ADV-001",
                firmId: "FIRM-001",
            }));
        
        if (toCreate.length > 0) {
            await prisma.client.createMany({
                data: toCreate
            });
            console.log(`[Orchestrator] Seeded ${toCreate.length} new clients in batch ${i+1}/${totalBatches}`);
        } else {
            console.log(`[Orchestrator] Batch ${i+1}/${totalBatches} already exists. Skipping.`);
        }
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
