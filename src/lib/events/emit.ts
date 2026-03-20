import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { env } from "@/lib/config";

const agentRunCompleteSchema = z.object({
  clientId: z.string().min(1),
  agentType: z.enum(["COMPLIANCE", "ONBOARDING"]),
  jobId: z.string().default("unknown"),
  success: z.boolean(),
});

export type AgentRunCompletePayload = z.infer<typeof agentRunCompleteSchema>;

/**
 * Broadcasts agent-run completion for dashboards that listen on Realtime broadcast channels.
 * No-ops when service role is unset (local dev without Supabase server credentials).
 */
export async function emitAgentRunComplete(
  raw: AgentRunCompletePayload
): Promise<void> {
  const payload = agentRunCompleteSchema.parse(raw);
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    console.info(
      "[emit] Skipping agent-run broadcast (SUPABASE_SERVICE_ROLE_KEY not set)"
    );
    return;
  }

  const supabase = createClient(env.SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const channel = supabase.channel("cerebro-agent-run-complete");
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Supabase channel subscribe timeout"));
      }, 8_000);
      channel.subscribe((status, err) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(timeout);
          resolve();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          clearTimeout(timeout);
          reject(err ?? new Error(`Supabase channel status: ${status}`));
        }
      });
    });

    const status = await channel.send({
      type: "broadcast",
      event: "agent_run_complete",
      payload,
    });
    if (status !== "ok") {
      console.warn("[emit] Broadcast send returned non-ok status:", status);
    }
  } catch (e) {
    console.error("[emit] Failed to broadcast agent run completion:", e);
  } finally {
    await supabase.removeChannel(channel);
  }
}
