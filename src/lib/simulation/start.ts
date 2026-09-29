import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { queues } from "@/lib/queue/client";
import { SimulationOrchestrator } from "./orchestrator";

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

    const dayBatchSize = 10;
    const clientBatchSize = 1000;
    const batchesTotal = Math.ceil(input.simulatedDays / dayBatchSize) *
      Math.ceil(input.clientCount / clientBatchSize);
    await prisma.simulationRun.update({ where: { id: run.id }, data: { batchesTotal } });

    let jobsEnqueued = 0;
    for (let day = 0; day < input.simulatedDays; day += dayBatchSize) {
      for (let client = 0; client < input.clientCount; client += clientBatchSize) {
        const jobId = `simulation-${run.id}-${day}-${client}`;
        await queues.simulation.add(jobId, {
          runId: run.id,
          batchStart: day,
          batchEnd: Math.min(day + dayBatchSize - 1, input.simulatedDays - 1),
          clientStart: client,
          clientEnd: Math.min(client + clientBatchSize, input.clientCount),
        }, { jobId, attempts: 3 });
        enqueuedJobIds.push(jobId);
        jobsEnqueued++;
      }
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
