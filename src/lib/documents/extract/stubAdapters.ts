import type { DocumentExtractAdapter } from "./adapter";
import { documentExtractInputSchema } from "./schemas";

/**
 * Stub for AWS Textract AnalyzeID-class extractors.
 * Not wired to AWS — configure credentials and implement later.
 */
export function createTextractExtractAdapter(): DocumentExtractAdapter {
  return {
    provider: "textract",
    async extract(input) {
      documentExtractInputSchema.parse(input);
      throw new Error(
        "Document extract provider 'textract' is not configured. " +
          "Use DOCUMENT_EXTRACT_PROVIDER=heuristic|llm-demo for demo, " +
          "or implement the Textract adapter with AWS credentials.",
      );
    },
  };
}

/**
 * Stub for Persona Document AI-class extractors.
 * Policy validation remains in Cerebro; this would only normalize IDP fields.
 */
export function createPersonaExtractAdapter(): DocumentExtractAdapter {
  return {
    provider: "persona",
    async extract(input) {
      documentExtractInputSchema.parse(input);
      throw new Error(
        "Document extract provider 'persona' is not configured. " +
          "Use DOCUMENT_EXTRACT_PROVIDER=heuristic|llm-demo for demo, " +
          "or implement the Persona adapter with API credentials.",
      );
    },
  };
}
