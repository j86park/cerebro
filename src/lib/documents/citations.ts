import { z } from "zod";
import {
  documentExtractResultSchema,
  type DocumentExtractResult,
} from "@/lib/documents/extract/schemas";

const citationShapeSchema = z.object({
  source: z.string().optional(),
  startOffset: z.number().nullable().optional(),
  endOffset: z.number().nullable().optional(),
  page: z.number().nullable().optional(),
  excerpt: z.string().optional(),
});

const structuredFieldValueSchema = z.object({
  value: z.union([z.string(), z.number(), z.boolean()]),
  label: z.string().optional(),
  confidence: z.number().nullable().optional(),
  citation: citationShapeSchema.optional(),
});

/**
 * Normalized citation row for ops UI (Reg BI / exam narrative).
 */
export const citationDisplayRowSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  value: z.string(),
  confidence: z.number().nullable().optional(),
  excerpt: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  page: z.number().nullable().optional(),
  startOffset: z.number().nullable().optional(),
  endOffset: z.number().nullable().optional(),
});

export type CitationDisplayRow = z.infer<typeof citationDisplayRowSchema>;

const META_KEYS = new Set([
  "extractProvider",
  "extractedAt",
  "daysUntilExpiry",
  "gapReason",
  "documentType",
  "onChecklist",
  "documentId",
  "vaultClientId",
]);

/**
 * Converts DocumentExtractResult into display rows.
 */
export function citationRowsFromExtract(
  extract: DocumentExtractResult | null | undefined,
): CitationDisplayRow[] {
  if (!extract) return [];
  const parsed = documentExtractResultSchema.safeParse(extract);
  if (!parsed.success) return [];
  return parsed.data.fields.map((field) =>
    citationDisplayRowSchema.parse({
      key: field.key,
      label: field.label,
      value: field.value,
      confidence: field.confidence,
      excerpt: field.citation.excerpt ?? null,
      source: field.citation.source,
      page: field.citation.page,
      startOffset: field.citation.startOffset,
      endOffset: field.citation.endOffset,
    }),
  );
}

/**
 * Parses ActionLedger `citedFields` JSON into display rows.
 * Prefers structured extract-shaped values; falls back to scalar meta.
 */
export function citationRowsFromCitedFields(
  citedFields: Record<string, unknown> | null | undefined,
): CitationDisplayRow[] {
  if (!citedFields || typeof citedFields !== "object") return [];

  const rows: CitationDisplayRow[] = [];
  for (const [key, raw] of Object.entries(citedFields)) {
    if (META_KEYS.has(key)) continue;
    const structured = structuredFieldValueSchema.safeParse(raw);
    if (structured.success) {
      rows.push(
        citationDisplayRowSchema.parse({
          key,
          label: structured.data.label ?? key.replace(/_/g, " "),
          value: String(structured.data.value),
          confidence: structured.data.confidence ?? null,
          excerpt: structured.data.citation?.excerpt ?? null,
          source: structured.data.citation?.source ?? null,
          page: structured.data.citation?.page ?? null,
          startOffset: structured.data.citation?.startOffset ?? null,
          endOffset: structured.data.citation?.endOffset ?? null,
        }),
      );
      continue;
    }
    if (
      typeof raw === "string" ||
      typeof raw === "number" ||
      typeof raw === "boolean"
    ) {
      rows.push(
        citationDisplayRowSchema.parse({
          key,
          label: key.replace(/_/g, " "),
          value: String(raw),
          confidence: null,
          excerpt: null,
          source: null,
          page: null,
          startOffset: null,
          endOffset: null,
        }),
      );
    }
  }
  return rows;
}

/**
 * Safe-parses unknown JSON into DocumentExtractResult or null.
 */
export function parseExtractedFieldsJson(
  value: unknown,
): DocumentExtractResult | null {
  const parsed = documentExtractResultSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
