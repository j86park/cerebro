import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { VaultService } from "@/lib/db/vault-service";
import {
  citedFieldsFromExtract,
  documentExtractResultSchema,
  runDocumentExtract,
} from "@/lib/documents/extract";

const inputSchema = z.object({
  documentId: z
    .string()
    .min(1)
    .describe("Document whose extractedFields should be re-run"),
  reasoning: z
    .string()
    .min(20)
    .describe("Why a refresh is needed (e.g. empty extracts, failed validate)"),
  agentType: z
    .enum(["COMPLIANCE", "ONBOARDING"])
    .default("COMPLIANCE")
    .describe("Calling agent for ActionLedger attribution"),
});

const outputSchema = z.object({
  success: z.boolean(),
  documentId: z.string(),
  extract: documentExtractResultSchema,
  fieldCount: z.number().int().nonnegative(),
});

/**
 * Builds refreshDocumentExtract — re-run extract adapter and persist via VaultService.
 * Provider comes from config factory; llm-demo uses getModel("dev") inside the adapter.
 */
export function buildRefreshDocumentExtract(vault: VaultService) {
  return createTool({
    id: "refreshDocumentExtract",
    description:
      "Re-runs document field extraction on stored sanitized text and writes extractedFields. Use when extracts are empty or stale before validateDocumentReceived / markResolved.",
    inputSchema,
    outputSchema,
    execute: async (inputData) => {
      const { documentId, reasoning, agentType } = inputSchema.parse(inputData);

      const doc = (await vault.getDocumentById(documentId)) as {
        id: string;
        type?: string | null;
        fileRef?: string | null;
      };
      const content = await vault.getDocumentContentForAgent(documentId);
      const documentType =
        typeof doc.type === "string" && doc.type.length > 0
          ? doc.type
          : content.type && content.type.length > 0
            ? content.type
            : "GOVERNMENT_ID";

      const extract = await runDocumentExtract({
        rawText: content.text,
        documentType,
        filePath:
          typeof doc.fileRef === "string" && doc.fileRef.length > 0
            ? doc.fileRef
            : undefined,
      });

      await vault.updateDocumentExtractedFields(documentId, extract);

      await vault.logAction({
        agentType,
        actionType: "VALIDATE_DOCUMENT",
        trigger: "MANUAL",
        documentId,
        reasoning,
        outcome: "EXTRACT_REFRESHED",
        reasonCodes: ["EXTRACT_REFRESH"],
        citedFields: citedFieldsFromExtract(extract),
      });

      return {
        success: true,
        documentId,
        extract,
        fieldCount: extract.fields.length,
      };
    },
  });
}
