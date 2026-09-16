import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { VaultService } from "@/lib/db/vault-service";
import {
  advisorDecisionRequestSchema,
  parseHitlContext,
  enqueueAdvisorDecision,
} from "@/lib/hitl";

/**
 * POST /api/approvals/decide — advisor approve / edit / deny for a suspended HITL escalation.
 * Enqueues a BullMQ resume job; does not call Mastra from the route handler.
 */
export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    const parsed = advisorDecisionRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request payload", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { clientId, openKey, decision, editedReasoning, advisorId } =
      parsed.data;

    if (decision === "edit" && !editedReasoning) {
      return NextResponse.json(
        { error: "editedReasoning is required when decision is edit" },
        { status: 400 },
      );
    }

    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true },
    });

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const vault = new VaultService({ clientId });
    const escalation = await vault.getEscalationStateByOpenKey(openKey);

    if (!escalation || typeof escalation !== "object") {
      return NextResponse.json(
        { error: "No pending escalation for openKey" },
        { status: 404 },
      );
    }

    const status = (escalation as { status?: string }).status;
    if (status !== "PENDING_APPROVAL") {
      return NextResponse.json(
        {
          error: `Escalation is not awaiting approval (status=${status ?? "unknown"})`,
        },
        { status: 409 },
      );
    }

    const hitlContext = parseHitlContext(
      (escalation as { hitlContext: unknown }).hitlContext,
    );

    const enqueued = await enqueueAdvisorDecision({
      clientId,
      openKey,
      workflowRunId: hitlContext.workflowRunId,
      decision,
      editedReasoning,
      advisorId,
    });

    return NextResponse.json(
      {
        data: {
          jobId: enqueued.jobId,
          deduplicated: enqueued.deduplicated,
          workflowRunId: hitlContext.workflowRunId,
          decision,
          clientId,
          openKey,
        },
      },
      { status: 202 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid HITL context on escalation", details: error.flatten() },
        { status: 422 },
      );
    }
    console.error("POST /api/approvals/decide error:", error);
    return NextResponse.json(
      { error: "Failed to enqueue advisor decision" },
      { status: 500 },
    );
  }
}
