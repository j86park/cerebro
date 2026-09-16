import { z } from "zod";
import { EscalationStatus } from "@/lib/db/enums";
import { hitlContextSchema } from "@/lib/hitl/schemas";

/** Document evidence slice included in an approval packet. */
export const approvalPacketDocumentSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  category: z.string().min(1),
  status: z.string().min(1),
  expiryDate: z.string().datetime().nullable(),
  notes: z.string().nullable().optional(),
  /** DocumentExtractResult JSON when extract adapter has run (WP-P1.2/1.3). */
  extractedFields: z.unknown().nullable().optional(),
});

/** Ledger evidence row included in an approval packet. */
export const approvalPacketLedgerEntrySchema = z.object({
  id: z.string().min(1),
  actionType: z.string().min(1),
  agentType: z.string().min(1),
  reasoning: z.string(),
  outcome: z.string().nullable(),
  stage: z.number().int().nullable().optional(),
  policyVersion: z.string().nullable().optional(),
  promptVersionId: z.string().nullable().optional(),
  actor: z.string().nullable().optional(),
  reasonCodes: z.array(z.string()),
  citedFields: z.record(z.unknown()).nullable().optional(),
  performedAt: z.string().datetime(),
});

/**
 * Minimal ops approval packet: escalation + HITL context + vault/ledger evidence
 * so an advisor can approve or deny without digging through raw tables.
 */
export const approvalPacketSchema = z.object({
  packetId: z.string().min(1),
  clientId: z.string().min(1),
  clientName: z.string().min(1),
  openKey: z.string().min(1),
  status: z.enum([
    EscalationStatus.PENDING_APPROVAL,
    EscalationStatus.SAFE_HOLD,
    EscalationStatus.OPEN,
  ]),
  ladderStage: z.number().int().min(0),
  reasonCodes: z.array(z.string()),
  policyVersion: z.string().nullable(),
  openedAt: z.string().datetime(),
  updatedAt: z.string().datetime().optional(),
  hitl: hitlContextSchema.nullable(),
  /** Document cited by the pending escalation, when present. */
  citedDocument: approvalPacketDocumentSchema.nullable(),
  /** Related vault documents (cited + recent non-valid). */
  vaultEvidence: z.array(approvalPacketDocumentSchema),
  /** Recent ActionLedger rows with reason codes / outcomes. */
  ledgerEvidence: z.array(approvalPacketLedgerEntrySchema),
  /** Existing HITL decide API path — UI posts here; no side effects from this DTO. */
  decideEndpoint: z.literal("/api/approvals/decide"),
});

export type ApprovalPacket = z.infer<typeof approvalPacketSchema>;
export type ApprovalPacketDocument = z.infer<typeof approvalPacketDocumentSchema>;
export type ApprovalPacketLedgerEntry = z.infer<
  typeof approvalPacketLedgerEntrySchema
>;

/** Firm-wide HITL / escalation SLA metrics (rates in [0, 1]). */
export const slaMetricsSchema = z.object({
  /** Clients with at least one escalate-class ledger action / total clients. */
  escalation_rate: z.number().min(0).max(1),
  /** HITL timeout / safe-hold outcomes / total HITL terminal outcomes. */
  timeout_rate: z.number().min(0).max(1),
  pendingApprovals: z.number().int().min(0),
  totalClients: z.number().int().min(0),
  clientsWithEscalation: z.number().int().min(0),
  hitlTimeouts: z.number().int().min(0),
  hitlDecisions: z.number().int().min(0),
  computedAt: z.string().datetime(),
});

export type SlaMetrics = z.infer<typeof slaMetricsSchema>;

export const listApprovalPacketsQuerySchema = z.object({
  status: z
    .enum([
      EscalationStatus.PENDING_APPROVAL,
      EscalationStatus.SAFE_HOLD,
      EscalationStatus.OPEN,
      "ALL_PENDING",
    ])
    .default(EscalationStatus.PENDING_APPROVAL),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export type ListApprovalPacketsQuery = z.infer<
  typeof listApprovalPacketsQuerySchema
>;
