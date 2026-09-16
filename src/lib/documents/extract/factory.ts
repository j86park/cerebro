import { env } from "@/lib/config";
import type { DocumentExtractAdapter } from "./adapter";
import { createHeuristicExtractAdapter } from "./heuristicAdapter";
import { createLlmDemoExtractAdapter } from "./llmDemoAdapter";
import {
  createPersonaExtractAdapter,
  createTextractExtractAdapter,
} from "./stubAdapters";
import {
  documentExtractProviderSchema,
  type DocumentExtractProvider,
} from "./schemas";

/**
 * Resolves the configured document extract adapter.
 * Provider comes from `env.DOCUMENT_EXTRACT_PROVIDER` only (never scattered process.env).
 */
export function getDocumentExtractAdapter(
  providerOverride?: DocumentExtractProvider,
): DocumentExtractAdapter {
  const provider = documentExtractProviderSchema.parse(
    providerOverride ?? env.DOCUMENT_EXTRACT_PROVIDER,
  );

  switch (provider) {
    case "heuristic":
      return createHeuristicExtractAdapter();
    case "llm-demo":
      return createLlmDemoExtractAdapter();
    case "textract":
      return createTextractExtractAdapter();
    case "persona":
      return createPersonaExtractAdapter();
    default: {
      const _exhaustive: never = provider;
      throw new Error(`Unknown document extract provider: ${String(_exhaustive)}`);
    }
  }
}
