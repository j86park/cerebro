import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { queues } from "@/lib/queue/client";
import { SimulationOrchestrator, SIMULATION_CLIENT_BATCH_SIZE } from "./orchestrator";

export const simulationStartSchema = z.object({
  clientCount: z.coerce.number().int().min(1).max(1000),
  simulatedDays: z.coerce.number().int().min(1).max(365),
  clientResponseRate: z.number().min(0).max(1).default(0.8),
  advisorResponseRate: z.number().min(0).max(1).default(0.9),
  randomSeed: z.string().min(1).optional(),
  useMockAgents: z.boolean().default(true),
});

export async function startSimulationRun(input: z.infer<typeof simulationStartSchema>) {
  const orchestrator = new SimulationOrchestrator();
  const run = await orchestrator.createSimulationRun(input);
  const enqueuedJobIds: string[] = [];
  try {
    await orchestrator.seedSimulationClients(input.clientCount, run.id);

    const batchesTotal = input.simulatedDays *
      Math.ceil(input.clientCount / SIMULATION_CLIENT_BATCH_SIZE);
    await prisma.simulationRun.update({ where: { id: run.id }, data: { batchesTotal } });

    let jobsEnqueued = 0;
    for (let client = 0; client < input.clientCount; client += SIMULATION_CLIENT_BATCH_SIZE) {
        const jobId = `simulation-${run.id}-0-${client}`;
        await queues.simulation.add(jobId, {
          runId: run.id,
          batchStart: 0,
          batchEnd: 0,
          clientStart: client,
          clientEnd: Math.min(client + SIMULATION_CLIENT_BATCH_SIZE, input.clientCount),
        }, { jobId, attempts: 3 });
        enqueuedJobIds.push(jobId);
        jobsEnqueued++;
    }
    return { run: await orchestrator.getRun(run.id), jobsEnqueued };
  } catch (error) {
    await prisma.simulationRun.update({
      where: { id: run.id },
      data: { status: "FAILED", completedAt: new Date() },
    });
    await Promise.all(enqueuedJobIds.map(async (jobId) => {
      try {
        await (await queues.simulation.getJob(jobId))?.remove();
      } catch {
        // An active worker will see FAILED on its next tick; do not mask the submission error.
      }
    }));
    throw error;
  }
}
