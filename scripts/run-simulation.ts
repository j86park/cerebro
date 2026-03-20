import { SimulationOrchestrator } from "../src/lib/simulation/orchestrator";
import { prisma } from "../src/lib/db/client";

async function runStandaloneSimulation() {
  const orchestrator = new SimulationOrchestrator();
  
  console.log("--- Cerebro Simulation Runner ---");
  
  // 1. Create a run
  const run = await orchestrator.createSimulationRun({
    clientCount: 10,
    simulatedDays: 7,
    clientResponseRate: 0.8,
    advisorResponseRate: 0.9,
    randomSeed: "cli-test-" + Date.now(),
  });
  
  console.log(`Created simulation run: ${run.id}`);
  
  // 2. Process day-by-day (serial for CLI simplicity)
  for (let day = 0; day < run.simulatedDays; day++) {
    const result = await orchestrator.tick(run.id, day);
    console.log(`[Day ${day}] Processed ${result.clientCount} clients, events triggered: ${result.eventsTriggered}`);
    
    await orchestrator.incrementProgress(run.id);
  }
  
  // 3. Aggregate metrics
  console.log("Simulation complete. Aggregating metrics...");
  const metrics = await orchestrator.aggregateMetrics(run.id);
  console.log("Metrics:", JSON.stringify(metrics, null, 2));
  
  console.log("--- Simulation Finished ---");
}

runStandaloneSimulation()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
