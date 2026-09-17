import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { VaultService } from "@/lib/db/vault-service";
import {
  documentExtractResultSchema,
  type DocumentExtractResult,
} from "@/lib/documents/extract";

const inputSchema = z.object({
  documentId: z
    .string()
    .min(1)
    .describe("Vault document id to re-fetch for mid-run review"),
});

const outputSchema = z.object({
  documentId: z.string(),
  type: z.string().nullable(),
  status: z.string().nullable(),
  text: z.string(),
  strippedPatterns: z.array(z.string()),
  agentContextBlock: z.string(),
  extractedFields: documentExtractResultSchema.nullable(),
});

/**
 * Builds getDocumentForReview — sanitized doc body + extracts mid-run.
 * Injection hygiene is already applied inside VaultService.getDocumentContentForAgent.
 */
export function buildGetDocumentForReview(vault: VaultService) {
  return createTool({
    id: "getDocumentForReview",
    description:
      "Re-fetches a document's sanitized text and extracted fields for mid-run review. Use when upload-injected content is missing or you need to re-check evidence before validate/resolve.",
    inputSchema,
    outputSchema,
    execute: async (inputData) => {
      const { documentId } = inputSchema.parse(inputData);

      const doc = (await vault.getDocumentById(documentId)) as {
        id: string;
        type?: string | null;
        status?: string | null;
      };

      const content = await vault.getDocumentContentForAgent(documentId);
      const extractedFields: DocumentExtractResult | null =
        await vault.getDocumentExtractedFields(documentId);

      return {
        documentId: content.documentId,
        type: content.type ?? (typeof doc.type === "string" ? doc.type : null),
        status: typeof doc.status === "string" ? doc.status : null,
        text: content.text,
        strippedPatterns: content.strippedPatterns,
        agentContextBlock: content.agentContextBlock,
        extractedFields,
      };
    },
  });
}
