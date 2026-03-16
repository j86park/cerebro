import { NextRequest, NextResponse } from "next/server";
import { queues } from "@/lib/queue/client";
import { z } from "zod";
import { prisma } from "@/lib/db/client";

const triggerSchema = z.object({
  clientId: z.string(),
  agentType: z.enum(["COMPLIANCE", "ONBOARDING"]),
  documentId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = triggerSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid request payload", details: result.error },
        { status: 400 }
      );
    }

    const { clientId, agentType, documentId } = result.data;

    // Verify client exists
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true },
    });

    if (!client) {
      return NextResponse.json(
        { error: "Client not found" },
        { status: 404 }
      );
    }

    let jobId;
    if (agentType === "COMPLIANCE") {
      const job = await queues.compliance.add(
        "compliance-run",
        {
          clientId,
          trigger: "MANUAL",
          documentId,
        },
        { priority: 1 } // Manual triggers get high priority
      );
      jobId = job.id;
    } else {
      const job = await queues.onboarding.add(
        "onboarding-run",
        {
          clientId,
          trigger: "MANUAL",
          documentId,
        },
        { priority: 1 }
      );
      jobId = job.id;
    }

    return NextResponse.json(
      { 
        success: true, 
        message: `${agentType} agent triggered for client ${clientId}`,
        jobId,
        enqueued: true
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
