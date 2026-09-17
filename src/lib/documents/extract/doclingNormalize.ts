import { z } from "zod";
import { env } from "@/lib/config";
import {
  documentExtractResultSchema,
  extractedFieldSchema,
  fieldCitationSchema,
  type DocumentExtractResult,
} from "./schemas";

/**
 * Docling-like layout JSON accepted by the normalize helper (SOTA P2.2 watch).
 * Not a live Docling Python service — fixture / future sidecar contract only.
 */
export const doclingLayoutFieldSchema = z.object({
  key: z.string().min(1).max(128),
  label: z.string().min(1).max(256).optional(),
  value: z.string().max(4000),
  confidence: z.number().min(0).max(1).nullable().optional(),
  /** 0-based offset into accompanying raw/markdown text when available. */
  startOffset: z.number().int().min(0).nullable().optional(),
  endOffset: z.number().int().min(0).nullable().optional(),
  page: z.number().int().min(1).nullable().optional(),
  excerpt: z.string().max(500).optional(),
});

export const doclingNormalizeInputSchema = z.object({
  documentType: z.string().min(1),
  /** Optional sanitized text used for raw_text citation grounding. */
  rawText: z.string().optional(),
  fields: z.array(doclingLayoutFieldSchema).min(1),
  extractedAt: z.string().datetime().optional(),
});

export type DoclingNormalizeInput = z.infer<typeof doclingNormalizeInputSchema>;

/**
 * Maps a Docling-like fixture payload into Cerebro `DocumentExtractResult`.
 * Policy (checklist / DEMO_DATE) stays outside this normalizer.
 */
export function normalizeDoclingFixture(
  input: DoclingNormalizeInput,
): DocumentExtractResult {
  const parsed = doclingNormalizeInputSchema.parse(input);

  const fields = parsed.fields.map((field) => {
    const hasOffsets =
      field.startOffset !== null &&
      field.startOffset !== undefined &&
      field.endOffset !== null &&
      field.endOffset !== undefined;

    const citation = fieldCitationSchema.parse({
      source: hasOffsets ? "raw_text" : field.page != null ? "page" : "adapter_metadata",
      startOffset: field.startOffset ?? null,
      endOffset: field.endOffset ?? null,
      page: field.page ?? null,
      excerpt: field.excerpt,
    });

    return extractedFieldSchema.parse({
      key: field.key,
      label: field.label ?? field.key,
      value: field.value,
      confidence: field.confidence ?? null,
      citation,
    });
  });

  return documentExtractResultSchema.parse({
    provider: "docling",
    documentType: parsed.documentType,
    fields,
    adapterNotes: ["Normalized from Docling-like fixture (no Python sidecar)"],
    extractedAt: parsed.extractedAt ?? env.DEMO_DATE,
  });
}
