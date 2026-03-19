import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/lib/db/client";
import { extractDocumentText } from "@/lib/documents/parser";
import { queues } from "@/lib/queue/client";
import type { DocumentCategory, DocumentType } from "@prisma/client";

/**
 * POST /api/vaults/[clientId]/upload
 * Handles real file uploads, stores them locally, and triggers agent processing.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { clientId: string } }
) {
  const { clientId } = params;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    // Cast to any then to enum type to satisfy prisma types from string input
    const type = (formData.get("type") as string) as any as DocumentType || "GOVERNMENT_ID";
    const category = (formData.get("category") as string) as any as DocumentCategory || "IDENTITY";

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = `${Date.now()}-${file.name.replace(/\s+/g, "_")}`;
    const clientDir = path.join(process.cwd(), "storage", clientId);
    const filePath = path.join(clientDir, fileName);

    // 1. Ensure directory exists and save file
    await fs.mkdir(clientDir, { recursive: true });
    await fs.writeFile(filePath, buffer);

    // 2. Extract Text
    const extractedText = await extractDocumentText(filePath);

    // 3. Create or Sync Document Record
    const document = await prisma.document.create({
      data: {
        clientId,
        type,
        category,
        status: "PENDING_REVIEW",
        uploadedAt: new Date(),
        fileRef: filePath,
        notes: extractedText, 
      },
    });

    // 4. Trigger Priority Agent Run
    await queues.priority.add(`upload-${document.id}`, {
      clientId,
      agentType: "COMPLIANCE",
      trigger: "EVENT_UPLOAD",
      documentId: document.id,
    });

    await queues.priority.add(`onboarding-upload-${document.id}`, {
      clientId,
      agentType: "ONBOARDING",
      trigger: "EVENT_UPLOAD",
      documentId: document.id,
    });

    return NextResponse.json({ 
      success: true, 
      documentId: document.id,
      fileName,
      extractedPreview: extractedText.substring(0, 100) + "..."
    });

  } catch (error) {
    console.error("[Upload API] Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
