import type { VaultService } from "@/lib/db/vault-service";
import { validateDocumentDeterministic } from "@/lib/documents/checklist";

/** Only an uploaded, deterministically valid replacement may close a compliance issue. */
export async function assertResolvableDocument(vault: VaultService, documentId: string) {
  const document = await vault.getDocumentById(documentId) as {
    id: string;
    type: string;
    status: string;
    uploadedAt: Date | null;
    expiryDate: Date | null;
  };
  if (document.status !== "PENDING_REVIEW" || !document.uploadedAt) {
    throw new Error(`Document ${documentId} must be an uploaded PENDING_REVIEW replacement before resolution`);
  }
  const validation = validateDocumentDeterministic(document, document.type, {
    purpose: "admission",
    asOf: vault.getNow(),
  });
  if (!validation.valid) {
    throw new Error(`Document ${documentId} cannot resolve compliance: ${validation.gapReason ?? validation.notes}`);
  }
  return validation;
}
