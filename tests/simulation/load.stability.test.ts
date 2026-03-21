import { describe, it, expect, beforeEach } from "vitest";
import { SimulationOrchestrator } from "../../src/lib/simulation/orchestrator";
import { prisma } from "../../src/lib/db/client";
import { runSeed } from "../../prisma/seed";

describe.skipIf(!process.env.DATABASE_URL)(
  "Simulation Load & Stability (100 clients × 3 days)",
  () => {
  const orchestrator = new SimulationOrchestrator();

  beforeEach(async () => {
    // 1. Ensure foundation exists (idempotent)
    await runSeed();
    // 2. Purge old simulation data
    await orchestrator.purgeSimulationData();
  }, 60000);

  it("should successfully seed and run 100 clients for 3 days without failure", async () => {
    const clientCount = 100;
    const simulatedDays = 3;
    
    // 1. Seed
    const seedResult = await orchestrator.seedSimulationClients(clientCount);
    expect(seedResult.count).toBe(clientCount);
    
    // Verify DB count
    const dbCount = await prisma.client.count({
        where: { email: { endsWith: "@example.com" } }
    });
    expect(dbCount).toBe(clientCount);

    // 2. Create Run
    const run = await orchestrator.createSimulationRun({
        clientCount,
        simulatedDays,
        clientResponseRate: 0.8,
        advisorResponseRate: 0.9,
        randomSeed: "stability-test-" + Date.now(),
    });
    expect(run.status).toBe("PENDING");

    // 3. Process Ticks (serial for test stability)
    console.log(`[Test] Starting 7-day tick sequence for ${clientCount} clients...`);
    for (let day = 0; day < simulatedDays; day++) {
        const result = await orchestrator.tick(run.id, day);
        expect(result.clientCount).toBe(clientCount);
        
        await orchestrator.incrementProgress(run.id);
    }

    // 4. Verify Final State
    const finalRun = await orchestrator.getRun(run.id);
    expect(finalRun?.status).toBe("COMPLETED");
    expect(finalRun?.batchesCompleted).toBe(simulatedDays);

    // 5. Aggregate and Check Metrics
    const metrics = await orchestrator.aggregateMetrics(run.id);
    expect(metrics?.simulatedDaysProcessed).toBe(simulatedDays);
    expect(metrics?.totalActionsTriggered).toBeDefined();

    const dist = metrics?.documentStatusDistribution;
    const docTotal = Array.isArray(dist)
      ? dist.reduce((acc, curr) => acc + (typeof curr === "object" && curr !== null && "_count" in curr ? Number((curr as { _count: number })._count) : 0), 0)
      : 0;
    console.log(`[Test] Stability test passed. Total documents created: ${docTotal}`);
  }, 120000); // 2 minute timeout (100 clients × 3 days is well under this on typical hardware)
});
