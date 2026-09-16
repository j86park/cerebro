import { NextRequest, NextResponse } from "next/server";
import { queues } from "@/lib/queue/client";
import { enqueueAgentJob } from "@/lib/queue/enqueue";
import { agentJobSchema } from "@/lib/queue/jobs";
import { z } from "zod";
import { prisma } from "@/lib/db/client";

const triggerSchema = z.object({
  clientId: z.string().min(1),
  agentType: z.enum(["COMPLIANCE", "ONBOARDING"]),
  trigger: z.literal("MANUAL").default("MANUAL"),
  documentId: z.string().optional(),
});

/**
 * POST /api/agents/trigger — enqueues a manual agent run to the priority queue.
 * Returns the BullMQ job ID so the dashboard can track it.
 * Deterministic jobIds prevent double-clicks from spawning parallel runs for the same DEMO_DATE.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = triggerSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid request payload", details: result.error.flatten() },
        { status: 400 }
      );
    }

    const payload = agentJobSchema.parse({
      ...result.data,
      trigger: "MANUAL",
    });

    // Verify client exists
    const client = await prisma.client.findUnique({
      where: { id: payload.clientId },
      select: { id: true },
    });

    if (!client) {
      return NextResponse.json(
        { error: "Client not found" },
        { status: 404 }
      );
    }

    const { jobId, deduplicated } = await enqueueAgentJob(
      queues.priority,
      payload,
      { priority: 1 }
    );

    return NextResponse.json(
      {
        data: {
          jobId,
          deduplicated,
          agentType: payload.agentType,
          clientId: payload.clientId,
        },
      },
      { status: 202 }
    );
  } catch (error) {
    console.error("POST /api/agents/trigger error:", error);
    return NextResponse.json(
      { error: "Failed to trigger agent" },
      { status: 500 }
    );
  }
}
