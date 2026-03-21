import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/lib/db/client";
import { extractDocumentText } from "@/lib/documents/parser";
import { queues } from "@/lib/queue/client";
import type { DocumentCategory, DocumentType } from "@prisma/client";
import { DocumentCategory as DocumentCategoryValues, DocumentType as DocumentTypeValues } from "@/lib/db/enums";

function parseDocumentTypeField(raw: FormDataEntryValue | null): DocumentType {
  const s = typeof raw === "string" ? raw : "";
  const values = Object.values(DocumentTypeValues) as string[];
  return (values.includes(s) ? s : "GOVERNMENT_ID") as DocumentType;
}

function parseDocumentCategoryField(raw: FormDataEntryValue | null): DocumentCategory {
  const s = typeof raw === "string" ? raw : "";
  const values = Object.values(DocumentCategoryValues) as string[];
  return (values.includes(s) ? s : "IDENTITY") as DocumentCategory;
}

/**
 * POST /api/vaults/[clientId]/upload
 * Handles real file uploads, stores them locally, and triggers agent processing.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const type = parseDocumentTypeField(formData.get("type"));
    const category = parseDocumentCategoryField(formData.get("category"));

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
    console.error("[Cerebro][api][upload] Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
