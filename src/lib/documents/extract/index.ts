import type { DocumentExtractAdapter } from "./adapter";
import { getDocumentExtractAdapter } from "./factory";
import {
  documentExtractInputSchema,
  documentExtractResultSchema,
  type DocumentExtractInput,
  type DocumentExtractResult,
  type DocumentExtractProvider,
  type ExtractedField,
  type FieldCitation,
} from "./schemas";

export type {
  DocumentExtractAdapter,
  DocumentExtractInput,
  DocumentExtractResult,
  DocumentExtractProvider,
  ExtractedField,
  FieldCitation,
};

export {
  documentExtractInputSchema,
  documentExtractResultSchema,
  documentExtractProviderSchema,
  extractedFieldSchema,
  fieldCitationSchema,
} from "./schemas";

export { getDocumentExtractAdapter } from "./factory";
export { extractFieldsHeuristic } from "./heuristicAdapter";

/**
 * Runs the configured (or overridden) extract adapter with Zod I/O validation.
 * Does not touch the database — callers persist via VaultService.
 */
export async function runDocumentExtract(
  input: DocumentExtractInput,
  options?: { provider?: DocumentExtractProvider; adapter?: DocumentExtractAdapter },
): Promise<DocumentExtractResult> {
  const parsedInput = documentExtractInputSchema.parse(input);
  const adapter =
    options?.adapter ?? getDocumentExtractAdapter(options?.provider);
  const result = await adapter.extract(parsedInput);
  return documentExtractResultSchema.parse(result);
}

/**
 * Flattens extract result into ActionLedger-friendly citedFields JSON.
 */
export function citedFieldsFromExtract(
  result: DocumentExtractResult,
): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    extractProvider: result.provider,
    extractedAt: result.extractedAt,
  };
  for (const field of result.fields) {
    fields[field.key] = {
      value: field.value,
      label: field.label,
      confidence: field.confidence,
      citation: field.citation,
    };
  }
  return fields;
}
