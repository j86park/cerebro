import { NextRequest } from "next/server";
import { connection } from "@/lib/queue/client";
import { AGENT_RUN_COMPLETE_CHANNEL } from "@/lib/events/emit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Local Redis Pub/Sub -> browser SSE. The database remains the source of truth. */
export async function GET(request: NextRequest) {
  const subscriber = connection.duplicate();
  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let closed = false;
  let onMessage: ((channel: string, message: string) => void) | undefined;
  let onAbort: (() => void) | undefined;

  const close = async () => {
    if (closed) return;
    closed = true;
    if (heartbeat) clearInterval(heartbeat);
    if (onMessage) subscriber.off("message", onMessage);
    if (onAbort) request.signal.removeEventListener("abort", onAbort);
    await subscriber.quit().catch(() => subscriber.disconnect());
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      onAbort = () => {
        void close();
        try { controller.close(); } catch { /* already closed */ }
      };
      request.signal.addEventListener("abort", onAbort, { once: true });
      try {
        await subscriber.subscribe(AGENT_RUN_COMPLETE_CHANNEL);
        if (closed) return;
        onMessage = (channel, message) => {
          if (channel !== AGENT_RUN_COMPLETE_CHANNEL || closed) return;
          controller.enqueue(encoder.encode(`event: agent_run_complete\ndata: ${message}\n\n`));
        };
        subscriber.on("message", onMessage);
        controller.enqueue(encoder.encode(": connected\n\n"));
        heartbeat = setInterval(() => {
          if (!closed) controller.enqueue(encoder.encode(": heartbeat\n\n"));
        }, 15_000);
      } catch (error) {
        await close();
        controller.error(error);
      }
    },
    async cancel() { await close(); },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
