import { generateText } from "ai";
import { env, getModel } from "@/lib/config";
import { demoNow } from "@/lib/dates/demo-date";
import type { DocumentExtractAdapter } from "./adapter";
import { extractFieldsHeuristic } from "./heuristicAdapter";
import {
  documentExtractInputSchema,
  documentExtractResultSchema,
  extractedFieldSchema,
  type DocumentExtractResult,
  type ExtractedField,
} from "./schemas";

const LLM_FIELD_KEYS = [
  "full_name",
  "date_of_birth",
  "expiry_date",
  "document_number",
  "address",
  "issue_date",
] as const;

function shouldUseHeuristicFallback(): boolean {
  if (env.DRY_RUN) return true;
  if (env.OPENROUTER_API_KEY === "dev-openrouter-key") return true;
  if (env.NODE_ENV === "test") return true;
  return false;
}

function buildExtractPrompt(rawText: string, documentType: string): string {
  const clipped = rawText.slice(0, 6000);
  return `
Extract identity/document fields from this ${documentType} text for a wealth-management vault demo.
Return JSON only:
{
  "fields": [
    {
      "key": one of ${JSON.stringify(LLM_FIELD_KEYS)},
      "label": human label,
      "value": string,
      "confidence": 0-1,
      "excerpt": short supporting snippet from the text
    }
  ]
}
Only include fields explicitly supported by the text. Do not invent values.

Document text:
"""
${clipped}
"""
`.trim();
}

function parseLlmFields(
  text: string,
  rawText: string,
): ExtractedField[] {
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd <= jsonStart) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
  } catch {
    return [];
  }
  if (typeof parsed !== "object" || parsed === null) return [];
  const fieldsRaw = (parsed as { fields?: unknown }).fields;
  if (!Array.isArray(fieldsRaw)) return [];

  const out: ExtractedField[] = [];
  for (const item of fieldsRaw) {
    if (typeof item !== "object" || item === null) continue;
    const rec = item as Record<string, unknown>;
    const key = typeof rec.key === "string" ? rec.key : "";
    const label = typeof rec.label === "string" ? rec.label : key;
    const value = typeof rec.value === "string" ? rec.value : "";
    const excerpt =
      typeof rec.excerpt === "string" ? rec.excerpt : value.slice(0, 120);
    const confidence =
      typeof rec.confidence === "number" ? rec.confidence : null;
    if (!key || !value) continue;

    const idx = excerpt ? rawText.indexOf(excerpt.slice(0, 40)) : -1;
    const candidate = {
      key,
      label,
      value,
      confidence,
      citation: {
        source: "raw_text" as const,
        startOffset: idx >= 0 ? idx : null,
        endOffset: idx >= 0 ? idx + Math.min(excerpt.length, 160) : null,
        page: null,
        excerpt: excerpt.slice(0, 160),
      },
    };
    const validated = extractedFieldSchema.safeParse(candidate);
    if (validated.success) out.push(validated.data);
  }
  return out;
}

/**
 * LLM demo extract adapter using `getModel("dev")`.
 * Falls back to heuristic under DRY_RUN / test / default API key so CI stays offline-safe.
 */
export function createLlmDemoExtractAdapter(): DocumentExtractAdapter {
  return {
    provider: "llm-demo",
    async extract(input) {
      const parsed = documentExtractInputSchema.parse(input);

      if (shouldUseHeuristicFallback()) {
        const heuristic = extractFieldsHeuristic(
          parsed.rawText,
          parsed.documentType,
        );
        return documentExtractResultSchema.parse({
          ...heuristic,
          provider: "llm-demo",
          adapterNotes: [
            ...heuristic.adapterNotes,
            "Fell back to heuristic extract (DRY_RUN/test/default OpenRouter key)",
          ],
        });
      }

      const { text } = await generateText({
        model: getModel("dev"),
        prompt: buildExtractPrompt(parsed.rawText, parsed.documentType),
      });
      const fields = parseLlmFields(text, parsed.rawText);
      const result: DocumentExtractResult = documentExtractResultSchema.parse({
        provider: "llm-demo",
        documentType: parsed.documentType,
        fields,
        adapterNotes:
          fields.length === 0
            ? ["LLM returned no parseable fields"]
            : [],
        extractedAt: demoNow().toISOString(),
      });
      return result;
    },
  };
}
