import { SimulationOrchestrator } from "../src/lib/simulation/orchestrator";
import { prisma } from "../src/lib/db/client";

async function run10kBenchmark() {
    const orchestrator = new SimulationOrchestrator();

    console.log("--- 10k Benchmark Phase ---");
    
    const run = await orchestrator.createSimulationRun({
      clientCount: 10000,
      simulatedDays: 30,
      clientResponseRate: 0.8,
      advisorResponseRate: 0.9,
      useMockAgents: true,
    });

    // Seed a cohort owned by this run.
    console.log("Seeding 10,000 clients...");
    await orchestrator.seedSimulationClients(10000, run.id);

    // 3. Trigger simulation via script or direct call
    // We'll run it for 30 days
    console.log("Starting 30-day simulation with Mock Agents...");
}

run10kBenchmark().catch(console.error).finally(() => prisma.$disconnect());
