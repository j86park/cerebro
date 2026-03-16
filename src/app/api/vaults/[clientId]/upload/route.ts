import { NextRequest, NextResponse } from "next/server";
import { VaultService } from "@/lib/db/vault-service";
import { queues } from "@/lib/queue/client";
import { DOCUMENT_REGISTRY } from "@/lib/documents/registry";
import { env } from "@/lib/config";
import { z } from "zod";

const uploadSchema = z.object({
  documentType: z.string().min(1),
  fileRef: z.string().optional(),
});

/**
 * POST /api/vaults/[clientId]/upload — mock document upload.
 * Upserts the document to PENDING_REVIEW and enqueues an event-driven agent job.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params;

  try {
    const body = await request.json();
    const result = uploadSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid request payload", details: result.error.flatten() },
        { status: 400 }
      );
    }

    const { documentType, fileRef } = result.data;

    // Validate document type exists in registry
    const docMeta =
      DOCUMENT_REGISTRY[documentType as keyof typeof DOCUMENT_REGISTRY];
    if (!docMeta) {
      return NextResponse.json(
        { error: "Unknown document type" },
        { status: 400 }
      );
    }

    const vault = new VaultService({ clientId });

    // 1. Upsert document with PENDING_REVIEW status
    const docId = `${clientId}-${documentType}`;
    await vault.upsertDocument({
      id: docId,
      type: documentType,
      category: docMeta.category,
      status: "PENDING_REVIEW",
      uploadedAt: new Date(env.DEMO_DATE),
      fileRef: fileRef || `mock-file-${docId}.pdf`,
    });

    // 2. Determine which agent should handle this
    const profile = await vault.getClientProfile();
    const isOnboarding =
      (profile as Record<string, unknown>).onboardingStatus === "IN_PROGRESS";
    const agentType = isOnboarding ? "ONBOARDING" : "COMPLIANCE";

    // Event-driven uploads always go to the priority queue
    const job = await queues.priority.add(
      `upload-${agentType}-${clientId}`,
      {
        clientId,
        agentType: agentType as "COMPLIANCE" | "ONBOARDING",
        trigger: "EVENT_UPLOAD" as const,
        documentId: docId,
      },
      { priority: 1 }
    );

    return NextResponse.json(
      {
        data: {
          documentId: docId,
          jobId: job.id,
          agentType,
        },
      },
      { status: 202 }
    );
  } catch (error) {
    console.error(`POST /api/vaults/${clientId}/upload error:`, error);
    return NextResponse.json(
      { error: "Failed to process upload" },
      { status: 500 }
    );
  }
}
