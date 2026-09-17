import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { VaultService } from "@/lib/db/vault-service";
import { addDemoDays } from "@/lib/dates/demo-date";
import { validateDocumentDeterministic } from "@/lib/documents/checklist";
import { citedFieldsFromExtract } from "@/lib/documents/extract";

const inputSchema = z.object({
  documentId: z
    .string()
    .describe("ID of the document that was uploaded and needs validation"),
});

const outputSchema = z.object({
  valid: z.boolean(),
  documentType: z.string(),
  status: z.string(),
  notes: z.string(),
  gapReason: z.string().nullable(),
  daysUntilExpiry: z.number().nullable(),
  expired: z.boolean(),
  staleRecency: z.boolean(),
  extractedFieldKeys: z.array(z.string()),
  /** True when this call persisted VALID on the document. */
  statusPersisted: z.boolean(),
});

/**
 * Builds validateDocumentReceived with DEMO_DATE expiry/recency validators.
 * On pass, persists VALID via VaultService so upload→advance can proceed.
 * Cites structured extract fields when present (WP-P1.2); policy remains deterministic Zod.
 */
export function buildValidateDocumentReceived(vault: VaultService) {
  return createTool({
    id: "validateDocumentReceived",
    description:
      "Validates an uploaded document against DEMO_DATE expiry/recency rules. When checks pass, persists VALID and logs VALIDATE_DOCUMENT so the agent can advance onboarding.",
    inputSchema,
    outputSchema,
    execute: async (inputData) => {
      const { documentId } = inputData;

      const documents = (await vault.getDocuments()) as Array<{
        id: string;
        type: string;
        status: string;
        expiryDate?: Date | string | null;
        uploadedAt?: Date | string | null;
      }>;
      const doc = documents.find((d) => d.id === documentId);

      if (!doc) {
        return {
          valid: false,
          documentType: "UNKNOWN",
          status: "NOT_FOUND",
          notes: `Document ${documentId} not found in this client's vault.`,
          gapReason: "MISSING",
          daysUntilExpiry: null,
          expired: false,
          staleRecency: false,
          extractedFieldKeys: [],
          statusPersisted: false,
        };
      }

      // Admission purpose: allow PENDING_REVIEW uploads (upload API status) to become VALID.
      const result = validateDocumentDeterministic(doc, doc.type, {
        purpose: "admission",
      });
      const extract = await vault.getDocumentExtractedFields(documentId);
      const extractCited = extract ? citedFieldsFromExtract(extract) : {};
      const extractedFieldKeys = extract?.fields.map((f) => f.key) ?? [];

      let statusPersisted = false;
      if (result.valid) {
        await vault.updateDocumentStatus(documentId, "VALID", result.notes);
        statusPersisted = true;
      }

      await vault.logAction({
        agentType: "ONBOARDING",
        actionType: "VALIDATE_DOCUMENT",
        trigger: "EVENT_UPLOAD",
        reasoning: `Validated document ${doc.type}. Status=${result.status}; expired=${result.expired}; staleRecency=${result.staleRecency}; persisted=${statusPersisted}.`,
        outcome: result.valid ? "DOCUMENT_VALID" : "DOCUMENT_INVALID",
        nextScheduledAt: addDemoDays(1),
        documentId,
        reasonCodes: result.valid
          ? ["VALIDATOR_PASS", "STATUS_PERSISTED_VALID"]
          : ["VALIDATOR_FAIL", result.gapReason ?? "UNKNOWN"],
        citedFields: {
          daysUntilExpiry: result.daysUntilExpiry,
          gapReason: result.gapReason,
          statusPersisted,
          ...extractCited,
        },
      });

      return {
        valid: result.valid,
        documentType: result.documentType,
        status: result.status,
        notes: result.notes,
        gapReason: result.gapReason,
        daysUntilExpiry: result.daysUntilExpiry,
        expired: result.expired,
        staleRecency: result.staleRecency,
        extractedFieldKeys,
        statusPersisted,
      };
    },
  });
}
