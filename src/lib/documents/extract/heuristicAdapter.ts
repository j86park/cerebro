import { demoNow } from "@/lib/dates/demo-date";
import type { DocumentExtractAdapter } from "./adapter";
import {
  documentExtractInputSchema,
  documentExtractResultSchema,
  type DocumentExtractResult,
  type ExtractedField,
} from "./schemas";

/** Label patterns commonly present in demo vault PDFs / synthetic notes. */
const FIELD_PATTERNS: Array<{
  key: string;
  label: string;
  pattern: RegExp;
}> = [
  {
    key: "full_name",
    label: "Full Name",
    pattern: /(?:full\s*name|name)\s*[:\-]\s*(.+)/i,
  },
  {
    key: "date_of_birth",
    label: "Date of Birth",
    pattern: /(?:date\s*of\s*birth|dob|birth\s*date)\s*[:\-]\s*([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4})/i,
  },
  {
    key: "expiry_date",
    label: "Expiry Date",
    pattern: /(?:expir(?:y|ation)\s*date|valid\s*until|expires)\s*[:\-]\s*([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4})/i,
  },
  {
    key: "document_number",
    label: "Document Number",
    pattern: /(?:document\s*(?:no|number|#)|id\s*(?:no|number|#)|license\s*(?:no|number))\s*[:\-]\s*([A-Za-z0-9\-]+)/i,
  },
  {
    key: "address",
    label: "Address",
    pattern: /(?:address|residential\s*address|proof\s*of\s*address)\s*[:\-]\s*(.+)/i,
  },
  {
    key: "issue_date",
    label: "Issue Date",
    pattern: /(?:issue\s*date|issued\s*on|date\s*issued)\s*[:\-]\s*([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4})/i,
  },
];

/**
 * Builds a citation for a regex match against raw text.
 */
function citationForMatch(
  rawText: string,
  match: RegExpExecArray,
): ExtractedField["citation"] {
  const startOffset = match.index;
  const endOffset = match.index + match[0].length;
  return {
    source: "raw_text",
    startOffset,
    endOffset,
    page: null,
    excerpt: rawText.slice(startOffset, Math.min(endOffset, startOffset + 160)),
  };
}

/**
 * Deterministic labeled-line extractor for demo / DRY_RUN / tests.
 * Does not call external IDP or LLM APIs.
 */
export function extractFieldsHeuristic(
  rawText: string,
  documentType: string,
): DocumentExtractResult {
  const fields: ExtractedField[] = [];
  for (const def of FIELD_PATTERNS) {
    const match = def.pattern.exec(rawText);
    if (!match?.[1]) continue;
    const value = match[1].trim().replace(/\s+/g, " ");
    if (!value) continue;
    fields.push({
      key: def.key,
      label: def.label,
      value,
      confidence: 0.85,
      citation: citationForMatch(rawText, match),
    });
  }

  return documentExtractResultSchema.parse({
    provider: "heuristic",
    documentType,
    fields,
    adapterNotes:
      fields.length === 0
        ? ["No labeled fields matched heuristic patterns"]
        : [],
    extractedAt: demoNow().toISOString(),
  });
}

/**
 * Heuristic document extract adapter (default for tests and DRY_RUN demos).
 */
export function createHeuristicExtractAdapter(): DocumentExtractAdapter {
  return {
    provider: "heuristic",
    async extract(input) {
      const parsed = documentExtractInputSchema.parse(input);
      return extractFieldsHeuristic(parsed.rawText, parsed.documentType);
    },
  };
}
