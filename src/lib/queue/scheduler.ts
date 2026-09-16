import { prisma } from "@/lib/db/client";
import { queues } from "@/lib/queue/client";
import { enqueueAgentJob } from "@/lib/queue/enqueue";
import { agentJobSchema } from "@/lib/queue/jobs";

/**
 * Enqueues scheduled full scans for every client: one COMPLIANCE and one ONBOARDING job each,
 * all on `cerebro-scheduled` (architecture §Queue Separation).
 * Uses deterministic jobIds (`scan:{clientId}:{demoDate}:{agentType}`) so cron retries do not
 * double-enqueue the same logical scan.
 */
export async function enqueueScheduledAgentScansForAllClients(): Promise<{
  enqueued: number;
  deduplicated: number;
  clientCount: number;
}> {
  const clients = await prisma.client.findMany({ select: { id: true } });
  let enqueued = 0;
  let deduplicated = 0;

  for (const { id: clientId } of clients) {
    for (const agentType of ["COMPLIANCE", "ONBOARDING"] as const) {
      const payload = agentJobSchema.parse({
        clientId,
        agentType,
        trigger: "SCHEDULED",
      });
      const result = await enqueueAgentJob(queues.scheduled, payload);
      if (result.deduplicated) {
        deduplicated += 1;
      } else {
        enqueued += 1;
      }
    }
  }

  return { enqueued, deduplicated, clientCount: clients.length };
}
