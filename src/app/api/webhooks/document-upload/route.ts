import { NextResponse } from "next/server";
import { queues } from "@/lib/queue/client";
import { z } from "zod";

const webhookSchema = z.object({
  type: z.string(),
  table: z.string(),
  record: z.object({
    id: z.string(),
    clientId: z.string(),
    status: z.string().optional(),
  }).passthrough(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const payload = webhookSchema.parse(body);

    if (payload.type === "INSERT" && payload.table === "documents" && payload.record.clientId) {
      // Enqueue document upload event as a priority job in Onboarding queue.
      // Can also be handled by Compliance, but architecture usually routes uploads based on client state.
      // We push to both or default to onboarding queue here for demo.
      await queues.onboarding.add(`upload-${payload.record.id}`, {
        clientId: payload.record.clientId,
        documentId: payload.record.id,
        reason: "document_upload_webhook",
      });
      return NextResponse.json({ success: true, queued: true }, { status: 202 });
    }

    return NextResponse.json({ success: true, ignored: true }, { status: 200 });
  } catch (err) {
    console.error("Webhook processing failed:", err);
    return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 });
  }
}
