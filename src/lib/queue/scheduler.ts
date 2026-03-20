import { prisma } from "@/lib/db/client";
import { queues } from "@/lib/queue/client";
import { agentJobSchema, type AgentJobPayload } from "@/lib/queue/jobs";

/**
 * Enqueues scheduled full scans for every client: one COMPLIANCE and one ONBOARDING job each,
 * all on `cerebro-scheduled` (architecture §Queue Separation).
 */
export async function enqueueScheduledAgentScansForAllClients(): Promise<{
  enqueued: number;
  clientCount: number;
}> {
  const clients = await prisma.client.findMany({ select: { id: true } });
  let enqueued = 0;

  for (const { id: clientId } of clients) {
    for (const agentType of ["COMPLIANCE", "ONBOARDING"] as const) {
      const payload: AgentJobPayload = agentJobSchema.parse({
        clientId,
        agentType,
        trigger: "SCHEDULED",
      });
      await queues.scheduled.add(`scheduled-${agentType}-${clientId}`, payload, {
        removeOnComplete: true,
      });
      enqueued += 1;
    }
  }

  return { enqueued, clientCount: clients.length };
}
