import { z } from "zod";
import { connection } from "@/lib/queue/client";

export const AGENT_RUN_COMPLETE_CHANNEL = "cerebro-agent-run-complete";

const agentRunCompleteSchema = z.object({
  clientId: z.string().min(1),
  agentType: z.enum(["COMPLIANCE", "ONBOARDING"]),
  jobId: z.string().default("unknown"),
  success: z.boolean(),
});

export type AgentRunCompletePayload = z.infer<typeof agentRunCompleteSchema>;

/** Publish a local Redis notification after the worker's DB writes are complete. */
export async function emitAgentRunComplete(
  raw: AgentRunCompletePayload
): Promise<void> {
  const payload = agentRunCompleteSchema.parse(raw);
  await connection.publish(AGENT_RUN_COMPLETE_CHANNEL, JSON.stringify(payload));
}
