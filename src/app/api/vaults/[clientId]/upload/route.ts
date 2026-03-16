import { NextRequest, NextResponse } from "next/server";
import { VaultService } from "@/lib/db/vault-service";
import { queues } from "@/lib/queue/client";
import { DOCUMENT_REGISTRY } from "@/lib/documents/registry";
import { z } from "zod";

const uploadSchema = z.object({
  documentType: z.string(),
  fileRef: z.string().optional(),
});

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
        { error: "Invalid request payload", details: result.error },
        { status: 400 }
      );
    }

    const { documentType, fileRef } = result.data;

    // Validate document type exists in registry
    const docMeta = DOCUMENT_REGISTRY[documentType as keyof typeof DOCUMENT_REGISTRY];
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
      uploadedAt: new Date(),
      fileRef: fileRef || `mock-file-${Date.now()}.pdf`,
    });

    // 2. Enqueue an agent job.
    // Determine which agent owns this document's review (Compliance or Onboarding)
    // For simplicity, we'll route to Compliance unless it's in the middle of onboarding
    const profile = await vault.getClientProfile();
    const isOnboarding = (profile as any).onboardingStatus === "IN_PROGRESS";
    
    let jobId;
    if (isOnboarding) {
      const job = await queues.onboarding.add(
        "onboarding-run",
        {
          clientId,
          trigger: "EVENT_UPLOAD",
          documentId: docId,
        },
        { priority: 1 } // High priority for manual/event triggers
      );
      jobId = job.id;
    } else {
      const job = await queues.compliance.add(
        "compliance-run",
        {
          clientId,
          trigger: "EVENT_UPLOAD",
          documentId: docId,
        },
        { priority: 1 }
      );
      jobId = job.id;
    }

    return NextResponse.json(
      { 
        success: true, 
        message: "Document uploaded and agent triggered",
        documentId: docId,
        jobId,
        enqueued: true
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
