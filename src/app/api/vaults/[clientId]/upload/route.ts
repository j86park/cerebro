import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { env } from "@/lib/config";
import { VaultService } from "@/lib/db/vault-service";
import { extractDocumentText } from "@/lib/documents/parser";
import { runDocumentExtract } from "@/lib/documents/extract";
import { sanitizeDocumentTextForAgentContext } from "@/lib/documents/injectionHygiene";
import { queues } from "@/lib/queue/client";
import { enqueueAgentJob } from "@/lib/queue/enqueue";
import { agentJobSchema } from "@/lib/queue/jobs";
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
 * Flow: pdf text → injection hygiene → pluggable field extract → VaultService write.
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

    // 2. Extract text and strip obvious injection wrappers before vault storage
    const extractedText = await extractDocumentText(filePath);
    const sanitized = sanitizeDocumentTextForAgentContext(extractedText);

    // 3. Structured fields via pluggable adapter (Zod policy stays in checklist tools)
    const extractResult = await runDocumentExtract({
      rawText: sanitized.text,
      documentType: type,
      filePath,
      mimeType: file.type || undefined,
    });

    // 4. Create document via VaultService (clientId-scoped)
    const vault = new VaultService({ clientId });
    const document = (await vault.createDocument({
      type,
      category,
      status: "PENDING_REVIEW",
      uploadedAt: new Date(env.DEMO_DATE),
      fileRef: filePath,
      notes: sanitized.text,
      extractedFields: extractResult,
    })) as { id: string };

    // 5. Trigger Priority Agent Runs (deterministic upload jobIds)
    for (const agentType of ["COMPLIANCE", "ONBOARDING"] as const) {
      await enqueueAgentJob(
        queues.priority,
        agentJobSchema.parse({
          clientId,
          agentType,
          trigger: "EVENT_UPLOAD",
          documentId: document.id,
        }),
        { priority: 1 }
      );
    }

    return NextResponse.json({
      success: true,
      documentId: document.id,
      fileName,
      extractedPreview: sanitized.text.substring(0, 100) + "...",
      injectionPatternsStripped: sanitized.strippedPatterns,
      extractProvider: extractResult.provider,
      extractedFieldCount: extractResult.fields.length,
    });

  } catch (error) {
    console.error("[Cerebro][api][upload] Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
