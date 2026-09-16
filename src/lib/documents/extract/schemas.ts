import { z } from "zod";

/**
 * Citation pointing at where an extracted field was grounded in source text/media.
 * Page/offset spans support exam/Reg BI narrative; adapters may leave them null.
 */
export const fieldCitationSchema = z.object({
  source: z.enum(["raw_text", "page", "adapter_metadata"]),
  /** 0-based character offset into sanitized raw text when source is raw_text. */
  startOffset: z.number().int().min(0).nullable(),
  endOffset: z.number().int().min(0).nullable(),
  /** 1-based page when source is page (IDP adapters). */
  page: z.number().int().min(1).nullable(),
  excerpt: z.string().max(500).optional(),
});

export type FieldCitation = z.infer<typeof fieldCitationSchema>;

/**
 * One structured field from a document extract adapter.
 * Policy validation (expiry/recency) stays in Cerebro checklist Zod — not here.
 */
export const extractedFieldSchema = z.object({
  key: z.string().min(1).max(128),
  label: z.string().min(1).max(256),
  value: z.string().max(4000),
  confidence: z.number().min(0).max(1).nullable(),
  citation: fieldCitationSchema,
});

export type ExtractedField = z.infer<typeof extractedFieldSchema>;

export const documentExtractProviderSchema = z.enum([
  "heuristic",
  "llm-demo",
  "textract",
  "persona",
]);

export type DocumentExtractProvider = z.infer<typeof documentExtractProviderSchema>;

export const documentExtractResultSchema = z.object({
  provider: documentExtractProviderSchema,
  documentType: z.string().min(1),
  fields: z.array(extractedFieldSchema),
  /** Free-form adapter notes (errors, fallbacks) — not policy decisions. */
  adapterNotes: z.array(z.string()).default([]),
  extractedAt: z.string().datetime(),
});

export type DocumentExtractResult = z.infer<typeof documentExtractResultSchema>;

export const documentExtractInputSchema = z.object({
  rawText: z.string(),
  documentType: z.string().min(1),
  filePath: z.string().optional(),
  mimeType: z.string().optional(),
});

export type DocumentExtractInput = z.infer<typeof documentExtractInputSchema>;
