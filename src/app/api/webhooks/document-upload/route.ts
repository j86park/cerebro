import { NextResponse } from "next/server";
import { queues } from "@/lib/queue/client";
import { enqueueAgentJob } from "@/lib/queue/enqueue";
import { agentJobSchema } from "@/lib/queue/jobs";
import { env } from "@/lib/config";
import { z } from "zod";

const webhookSchema = z.object({
  type: z.string(),
  table: z.string(),
  record: z
    .object({
      id: z.string(),
      clientId: z.string(),
      status: z.string().optional(),
    })
    .passthrough(),
});

/**
 * POST /api/webhooks/document-upload — Supabase webhook endpoint.
 * Validates webhook secret, parses payload, and enqueues an event-driven
 * agent job to the priority queue. Returns 202 immediately.
 * Uses deterministic upload:{clientId}:{docId}_{agentType} jobIds for webhook retries.
 */
export async function POST(req: Request) {
  // SECURITY: Validate webhook secret header
  const secret = req.headers.get("x-cerebro-webhook-secret");
  if (!secret || secret !== env.WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const body = await req.json();
    const payload = webhookSchema.parse(body);

    if (
      payload.type === "INSERT" &&
      payload.table === "documents" &&
      payload.record.clientId
    ) {
      const jobPayload = agentJobSchema.parse({
        clientId: payload.record.clientId,
        agentType: "ONBOARDING",
        trigger: "EVENT_UPLOAD",
        documentId: payload.record.id,
      });

      const { jobId, deduplicated } = await enqueueAgentJob(
        queues.priority,
        jobPayload,
        { priority: 1 }
      );

      return NextResponse.json(
        { data: { queued: true, jobId, deduplicated } },
        { status: 202 }
      );
    }

    return NextResponse.json(
      { data: { ignored: true } },
      { status: 200 }
    );
  } catch (err) {
    console.error("Webhook processing failed:", err);
    return NextResponse.json(
      { error: "Invalid webhook payload" },
      { status: 400 }
    );
  }
}
