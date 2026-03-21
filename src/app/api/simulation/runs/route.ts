import { NextResponse } from "next/server";
import { SimulationOrchestrator } from "@/lib/simulation/orchestrator";
import { queues } from "@/lib/queue/client";
import { prisma } from "@/lib/db/client";

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const orchestrator = new SimulationOrchestrator();
    const runs = await orchestrator.getRecentRuns(20);
    return NextResponse.json({ data: { runs } });
  } catch (error) {
    console.error("[API] Failed to fetch simulation runs:", error);
    return NextResponse.json({ error: "Failed to fetch simulation runs" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    console.log("[API] Received simulation request:", body);
    const { clientCount = 100, simulatedDays = 7, useMockAgents = true } = body;

    const orchestrator = new SimulationOrchestrator();

    // 0. Clean slate for simulation metrics
    console.log("[API] Purging old simulation data...");
    await orchestrator.purgeSimulationData();

    // 1. Create Run Record
    console.log("[API] Creating simulation run record...");
    const run = await orchestrator.createSimulationRun({
      clientCount,
      simulatedDays,
      useMockAgents,
      clientResponseRate: 0.8,
      advisorResponseRate: 0.9,
    });
    console.log(`[API] Created run ${run.id}.`);

    // 2. Ensure Clients are Seeded (Idempotent for simulations)
    console.log("[API] Checking client count...");
    const existingCount = await prisma.client.count({ where: { email: { endsWith: '@example.com' } } });
    console.log(`[API] Found ${existingCount} existing simulation clients. Targeted ${clientCount}.`);
    
    if (existingCount < clientCount) {
        const toSeed = clientCount - existingCount;
        console.log(`[API] Seeding ${toSeed} more clients...`);
        // Limit seeding to safe amount in API request to prevent timeout
        if (toSeed > 1000) {
           throw new Error(`Refusing to seed ${toSeed} clients in a single API request. Please use a smaller count or seed via script.`);
        }
        await orchestrator.seedSimulationClients(toSeed);
    }

    // 3. Batch Fragment and Enqueue
    const batchSize = 10; // 10 days per job
    const totalDayBatches = Math.ceil(simulatedDays / batchSize);
    const clientBatchSize = 1000;
    const totalClientBatches = Math.ceil(clientCount / clientBatchSize);
    
    console.log(`[API] Enqueueing ${totalDayBatches * totalClientBatches} jobs...`);
    let jobsEnqueued = 0;
    for (let d = 0; d < totalDayBatches; d++) {
        const batchStart = d * batchSize;
        const batchEnd = Math.min(batchStart + batchSize - 1, simulatedDays - 1);
        
        for (let c = 0; c < totalClientBatches; c++) {
            const clientStart = c * clientBatchSize;
            const clientEnd = Math.min(clientStart + clientBatchSize, clientCount);
            
            await queues.simulation.add(`manual-run-${run.id}-d${batchStart}-c${clientStart}`, {
                runId: run.id,
                batchStart,
                batchEnd,
                clientStart,
                clientEnd,
            }, { 
                removeOnComplete: true,
                attempts: 3
            });
            jobsEnqueued++;
        }
    }

    // Update total batches count
    console.log(`[API] Updating run ${run.id} with ${jobsEnqueued} batches.`);
    await prisma.simulationRun.update({
        where: { id: run.id },
        data: { batchesTotal: jobsEnqueued }
    });

    console.log(`[API] Simulation ${run.id} successfully queued.`);
    return NextResponse.json({ data: { run, jobsEnqueued } });
  } catch (error) {
    console.error("[API] Failed to trigger simulation:", error);
    return NextResponse.json({ 
      error: "Failed to trigger simulation", 
      message: error instanceof Error ? error.message : String(error) 
    }, { status: 500 });
  }
}
