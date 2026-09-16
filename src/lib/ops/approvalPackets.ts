import { z } from "zod";
import type { VaultService } from "@/lib/db/vault-service";
import { EscalationStatus } from "@/lib/db/enums";
import { parseHitlContext } from "@/lib/hitl/applyDecision";
import {
  approvalPacketSchema,
  type ApprovalPacket,
  type ApprovalPacketDocument,
  type ApprovalPacketLedgerEntry,
} from "./schemas";

const escalationRowSchema = z.object({
  id: z.string().min(1),
  clientId: z.string().min(1),
  openKey: z.string().nullable(),
  status: z.string().min(1),
  ladderStage: z.number().int(),
  reasonCodes: z.array(z.string()).default([]),
  policyVersion: z.string().nullable().optional(),
  hitlContext: z.unknown().nullable().optional(),
  documentId: z.string().nullable().optional(),
  openedAt: z.coerce.date(),
  updatedAt: z.coerce.date().optional(),
});

const clientNameSchema = z.object({
  name: z.string().min(1),
});

const documentRowSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  category: z.string().min(1),
  status: z.string().min(1),
  expiryDate: z.coerce.date().nullable().optional(),
  notes: z.string().nullable().optional(),
  extractedFields: z.unknown().nullable().optional(),
});

const ledgerRowSchema = z.object({
  id: z.string().min(1),
  actionType: z.string().min(1),
  agentType: z.string().min(1),
  reasoning: z.string(),
  outcome: z.string().nullable().optional(),
  stage: z.number().int().nullable().optional(),
  policyVersion: z.string().nullable().optional(),
  promptVersionId: z.string().nullable().optional(),
  actor: z.string().nullable().optional(),
  reasonCodes: z.array(z.string()).optional().default([]),
  citedFields: z.unknown().nullable().optional(),
  performedAt: z.coerce.date(),
});

const buildPacketInputSchema = z.object({
  vault: z.custom<VaultService>((v) => v != null && typeof v === "object"),
  escalation: escalationRowSchema,
  clientName: z.string().min(1),
  ledgerLimit: z.number().int().min(1).max(50).default(10),
});

function toDocumentEvidence(
  doc: z.infer<typeof documentRowSchema>,
): ApprovalPacketDocument {
  return {
    id: doc.id,
    type: doc.type,
    category: doc.category,
    status: doc.status,
    expiryDate: doc.expiryDate ? doc.expiryDate.toISOString() : null,
    notes: doc.notes ?? null,
    extractedFields: doc.extractedFields ?? null,
  };
}

function toLedgerEvidence(
  row: z.infer<typeof ledgerRowSchema>,
): ApprovalPacketLedgerEntry {
  const cited =
    row.citedFields &&
    typeof row.citedFields === "object" &&
    !Array.isArray(row.citedFields)
      ? (row.citedFields as Record<string, unknown>)
      : null;

  return {
    id: row.id,
    actionType: row.actionType,
    agentType: row.agentType,
    reasoning: row.reasoning,
    outcome: row.outcome ?? null,
    stage: row.stage ?? null,
    policyVersion: row.policyVersion ?? null,
    promptVersionId: row.promptVersionId ?? null,
    actor: row.actor ?? null,
    reasonCodes: row.reasonCodes ?? [],
    citedFields: cited,
    performedAt: row.performedAt.toISOString(),
  };
}

/**
 * Builds an approval packet from EscalationState + VaultService-scoped
 * document and ActionLedger evidence. Does not send email or call HITL.
 */
export async function buildApprovalPacket(
  input: z.input<typeof buildPacketInputSchema>,
): Promise<ApprovalPacket> {
  const parsed = buildPacketInputSchema.parse(input);
  const { vault, escalation, clientName, ledgerLimit } = parsed;

  if (!escalation.openKey) {
    throw new Error(
      `Cannot build approval packet: escalation ${escalation.id} has no openKey`,
    );
  }

  if (vault.getClientId() !== escalation.clientId) {
    throw new Error(
      `VaultService clientId=${vault.getClientId()} does not match escalation clientId=${escalation.clientId}`,
    );
  }

  let hitl = null;
  if (escalation.hitlContext != null) {
    hitl = parseHitlContext(escalation.hitlContext);
  }

  const [rawDocs, rawActions] = await Promise.all([
    vault.getDocuments(),
    vault.getActionHistory(),
  ]);

  const documents = z.array(documentRowSchema).parse(rawDocs);
  const actions = z.array(ledgerRowSchema).parse(rawActions);

  const citedId =
    hitl?.documentId ?? escalation.documentId ?? undefined;

  const citedDocument = citedId
    ? documents.find((d) => d.id === citedId) ?? null
    : null;

  const vaultEvidence = documents
    .filter(
      (d) =>
        d.id === citedId ||
        d.status === "EXPIRED" ||
        d.status === "EXPIRING_SOON" ||
        d.status === "MISSING" ||
        d.status === "REQUESTED",
    )
    .slice(0, 12)
    .map(toDocumentEvidence);

  const ledgerEvidence = actions.slice(0, ledgerLimit).map(toLedgerEvidence);

  const packet = {
    packetId: `${escalation.clientId}:${escalation.openKey}`,
    clientId: escalation.clientId,
    clientName,
    openKey: escalation.openKey,
    status: escalation.status as ApprovalPacket["status"],
    ladderStage: escalation.ladderStage,
    reasonCodes: escalation.reasonCodes,
    policyVersion: escalation.policyVersion ?? null,
    openedAt: escalation.openedAt.toISOString(),
    updatedAt: escalation.updatedAt?.toISOString(),
    hitl,
    citedDocument: citedDocument ? toDocumentEvidence(citedDocument) : null,
    vaultEvidence,
    ledgerEvidence,
    decideEndpoint: "/api/approvals/decide" as const,
  };

  return approvalPacketSchema.parse(packet);
}

/**
 * Resolves client display name from a VaultService profile fetch.
 */
export async function resolveClientName(vault: VaultService): Promise<string> {
  const profile = await vault.getClientProfile();
  return clientNameSchema.parse(profile).name;
}

/** Statuses that still need ops attention in the approval queue. */
export const OPS_PENDING_STATUSES = [
  EscalationStatus.PENDING_APPROVAL,
  EscalationStatus.SAFE_HOLD,
  EscalationStatus.OPEN,
] as const;
