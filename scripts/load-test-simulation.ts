import { SimulationOrchestrator } from "../src/lib/simulation/orchestrator";
import { prisma } from "../src/lib/db/client";
import { queues } from "../src/lib/queue/client";

/**
 * CLI Load Test Runner for Cerebro Simulation
 * Triggers a large-scale simulation via BullMQ workers.
 */
async function triggerLoadTest() {
  const orchestrator = new SimulationOrchestrator();
  
  const args = process.argv.slice(2);
  const clientCount = parseInt(args[0]) || 1000;
  const simulatedDays = parseInt(args[1]) || 30;
  const batchSize = 5; // Days per job batch

  console.log(`\n--- Cerebro Load Test Trigger ---`);
  console.log(`Target: ${clientCount} clients`);
  console.log(`Simulated Duration: ${simulatedDays} days`);
  console.log(`Batching: ${batchSize} days per job`);
  
  const startTime = Date.now();

  // 1. Create a simulation run entry
  const run = await orchestrator.createSimulationRun({
    clientCount,
    simulatedDays,
    clientResponseRate: 0.8,
    advisorResponseRate: 0.9,
    randomSeed: "load-test-" + Date.now(),
  });
  
  console.log(`\nCreated Simulation Run: ${run.id}`);
  console.log(`Status: PENDING`);

  // 2. Fragment the simulation into job batches and enqueue
  console.log(`Enqueuing batches...`);
  
  const totalBatches = Math.ceil(simulatedDays / batchSize);
  
  for (let i = 0; i < totalBatches; i++) {
    const batchStart = i * batchSize;
    const batchEnd = Math.min(batchStart + batchSize - 1, simulatedDays - 1);
    
    await queues.simulation.add(`load-test-batch-${i}`, {
      runId: run.id,
      batchStart,
      batchEnd,
    });
  }

  console.log(`Successfully enqueued ${totalBatches} batches to 'cerebro-simulation' queue.`);
  console.log(`Workers will now process the run. Check worker logs for real-time throughput metrics.`);

  // 3. Monitor for completion
  console.log(`Monitoring progress (updates every 5s)...`);
  
  let isDone = false;
  while (!isDone) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    const currentRun = await orchestrator.getRun(run.id);
    
    if (!currentRun) break;

    const progress = (currentRun.batchesCompleted / simulatedDays) * 100;
    process.stdout.write(`\rProgress: ${progress.toFixed(1)}% (${currentRun.batchesCompleted}/${simulatedDays} days)`);

    if (currentRun.status === "COMPLETED") {
      isDone = true;
      const totalElapsed = (Date.now() - startTime) / 1000;
      console.log(`\n\n--- Load Test Finished ---`);
      console.log(`Total Duration: ${totalElapsed.toFixed(2)}s`);
      console.log(`Final Status: ${currentRun.status}`);
      
      // Aggregate final metrics
      console.log("Aggregating metrics...");
      const metrics = await orchestrator.aggregateMetrics(run.id);
      console.log("Metrics Summary:", JSON.stringify(metrics, null, 2));
    }
  }
}

triggerLoadTest()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
