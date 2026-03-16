import { NextResponse } from "next/server";
import { queues } from "@/lib/queue/client";
import { agentJobSchema } from "@/lib/queue/jobs";
import { z } from "zod";

const triggerRequestSchema = z.object({
  clientId: z.string().min(1),
  agentType: z.enum(["COMPLIANCE", "ONBOARDING"]),
  trigger: z.enum(["SCHEDULED", "EVENT_UPLOAD", "MANUAL"]).default("MANUAL"),
  documentId: z.string().optional(),
});

/**
 * POST /api/triggers — generic trigger endpoint.
 * Validates payload and enqueues to the priority queue.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = triggerRequestSchema.parse(body);
    const payload = agentJobSchema.parse(parsed);

    await queues.priority.add(
      `trigger-${payload.agentType}-${payload.clientId}`,
      payload,
      { priority: 1 }
    );

    return NextResponse.json(
      { data: { queued: true } },
      { status: 202 }
    );
  } catch (err) {
    console.error("Manual trigger failed:", err);
    return NextResponse.json(
      { error: "Invalid trigger payload" },
      { status: 400 }
    );
  }
}
