import type {
  DocumentExtractInput,
  DocumentExtractResult,
} from "./schemas";

/**
 * Pluggable document field extractor.
 * Returns structured fields + citations; Cerebro Zod policy remains elsewhere.
 */
export type DocumentExtractAdapter = {
  readonly provider: DocumentExtractResult["provider"];
  extract(input: DocumentExtractInput): Promise<DocumentExtractResult>;
};
