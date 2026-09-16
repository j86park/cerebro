import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { VaultService } from "@/lib/db/vault-service";
import { EscalationStatus } from "@/lib/db/enums";
import { env } from "@/lib/config";
import {
  buildApprovalPacket,
  OPS_PENDING_STATUSES,
  resolveClientName,
} from "./approvalPackets";
import {
  computeSlaMetrics,
  ESCALATE_ACTION_TYPES,
  HITL_DECISION_REASON_CODES,
  isHitlTerminalReasonCodes,
  isHitlTimeoutReasonCodes,
} from "./slaMetrics";
import {
  listApprovalPacketsQuerySchema,
  type ApprovalPacket,
  type ListApprovalPacketsQuery,
  type SlaMetrics,
} from "./schemas";

const listPendingInputSchema = listApprovalPacketsQuerySchema;

/**
 * Lists firm-wide pending approval packets assembled via VaultService evidence.
 * Uses prisma only for the firm-wide EscalationState index (dashboard/API layer).
 */
export async function listPendingApprovalPackets(
  query?: Partial<ListApprovalPacketsQuery>,
): Promise<ApprovalPacket[]> {
  const parsed = listPendingInputSchema.parse(query ?? {});
  const statuses =
    parsed.status === "ALL_PENDING"
      ? [...OPS_PENDING_STATUSES]
      : [parsed.status];

  const rows = await prisma.escalationState.findMany({
    where: {
      status: { in: statuses },
      openKey: { not: null },
    },
    orderBy: { openedAt: "asc" },
    take: parsed.limit,
    include: {
      client: { select: { name: true } },
    },
  });

  const packets: ApprovalPacket[] = [];
  for (const row of rows) {
    if (!row.openKey) continue;
    const vault = new VaultService({ clientId: row.clientId });
    const packet = await buildApprovalPacket({
      vault,
      clientName: row.client.name,
      escalation: {
        id: row.id,
        clientId: row.clientId,
        openKey: row.openKey,
        status: row.status,
        ladderStage: row.ladderStage,
        reasonCodes: row.reasonCodes,
        policyVersion: row.policyVersion,
        hitlContext: row.hitlContext,
        documentId: row.documentId,
        openedAt: row.openedAt,
        updatedAt: row.updatedAt,
      },
    });
    packets.push(packet);
  }
  return packets;
}

const getPacketInputSchema = z.object({
  clientId: z.string().min(1),
  openKey: z.string().min(1),
});

/**
 * Loads a single approval packet for a client openKey via VaultService.
 */
export async function getApprovalPacket(input: {
  clientId: string;
  openKey: string;
}): Promise<ApprovalPacket | null> {
  const { clientId, openKey } = getPacketInputSchema.parse(input);
  const vault = new VaultService({ clientId });
  const escalation = await vault.getEscalationStateByOpenKey(openKey);
  if (!escalation || typeof escalation !== "object") {
    return null;
  }

  const row = escalation as {
    id: string;
    clientId?: string;
    openKey: string | null;
    status: string;
    ladderStage: number;
    reasonCodes?: string[];
    policyVersion?: string | null;
    hitlContext?: unknown;
    documentId?: string | null;
    openedAt: Date;
    updatedAt?: Date;
  };

  if (
    row.status !== EscalationStatus.PENDING_APPROVAL &&
    row.status !== EscalationStatus.SAFE_HOLD &&
    row.status !== EscalationStatus.OPEN
  ) {
    return null;
  }

  const clientName = await resolveClientName(vault);
  return buildApprovalPacket({
    vault,
    clientName,
    escalation: {
      id: row.id,
      clientId,
      openKey: row.openKey,
      status: row.status,
      ladderStage: row.ladderStage,
      reasonCodes: row.reasonCodes ?? [],
      policyVersion: row.policyVersion,
      hitlContext: row.hitlContext,
      documentId: row.documentId,
      openedAt: row.openedAt,
      updatedAt: row.updatedAt,
    },
  });
}

/**
 * Computes firm SLA metrics from Postgres aggregates (no external sends).
 */
export async function getFirmSlaMetrics(): Promise<SlaMetrics> {
  const [
    totalClients,
    clientsWithEscalationGroups,
    pendingApprovals,
    hitlDecisionRows,
  ] = await Promise.all([
    prisma.client.count(),
    prisma.agentAction.groupBy({
      by: ["clientId"],
      where: {
        actionType: { in: [...ESCALATE_ACTION_TYPES] },
      },
    }),
    prisma.escalationState.count({
      where: { status: EscalationStatus.PENDING_APPROVAL },
    }),
    prisma.agentAction.findMany({
      where: {
        reasonCodes: { hasSome: [...HITL_DECISION_REASON_CODES] },
      },
      select: { reasonCodes: true },
    }),
  ]);

  let hitlDecisions = 0;
  let hitlTimeouts = 0;
  for (const row of hitlDecisionRows) {
    if (isHitlTerminalReasonCodes(row.reasonCodes)) {
      hitlDecisions += 1;
      if (isHitlTimeoutReasonCodes(row.reasonCodes)) {
        hitlTimeouts += 1;
      }
    }
  }

  return computeSlaMetrics({
    totalClients,
    clientsWithEscalation: clientsWithEscalationGroups.length,
    pendingApprovals,
    hitlDecisions,
    hitlTimeouts,
    computedAt: env.DEMO_DATE,
  });
}
