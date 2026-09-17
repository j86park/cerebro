import type { DocumentExtractAdapter } from "./adapter";
import {
  doclingNormalizeInputSchema,
  normalizeDoclingFixture,
} from "./doclingNormalize";
import {
  documentExtractInputSchema,
  type DocumentExtractInput,
} from "./schemas";

/**
 * Stub Docling / local-parse sidecar adapter (SOTA P2.2 watch).
 * Throws when no pre-normalized fixture JSON is supplied via `rawText` prefix.
 *
 * Fixture mode: `rawText` starting with `__DOCLING_FIXTURE__:` + JSON payload
 * accepted by `normalizeDoclingFixture`. Unit CI uses this path only ($0).
 */
export function createDoclingExtractAdapter(): DocumentExtractAdapter {
  return {
    provider: "docling",
    async extract(input: DocumentExtractInput) {
      const parsed = documentExtractInputSchema.parse(input);
      const marker = "__DOCLING_FIXTURE__:";
      if (parsed.rawText.startsWith(marker)) {
        const json = parsed.rawText.slice(marker.length);
        let raw: unknown;
        try {
          raw = JSON.parse(json) as unknown;
        } catch {
          throw new Error(
            "Document extract provider 'docling' fixture JSON is invalid.",
          );
        }

        const base =
          typeof raw === "object" && raw !== null
            ? (raw as Record<string, unknown>)
            : {};

        const documentType =
          typeof base.documentType === "string"
            ? base.documentType
            : parsed.documentType;

        const fixture = doclingNormalizeInputSchema.parse({
          ...base,
          documentType,
        });
        return normalizeDoclingFixture(fixture);
      }

      throw new Error(
        "Document extract provider 'docling' is not configured. " +
          "Local Docling Python sidecar is TBD (SOTA P2.2 watch). " +
          "Use DOCUMENT_EXTRACT_PROVIDER=heuristic|llm-demo for demo, " +
          "or pass a __DOCLING_FIXTURE__: JSON payload in unit tests.",
      );
    },
  };
}
