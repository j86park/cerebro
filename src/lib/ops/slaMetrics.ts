import { z } from "zod";
import { env } from "@/lib/config";
import { ActionType, EscalationStatus } from "@/lib/db/enums";
import { slaMetricsSchema, type SlaMetrics } from "./schemas";

const ESCALATE_ACTION_TYPES = [
  ActionType.ESCALATE_COMPLIANCE,
  ActionType.ESCALATE_MANAGEMENT,
  ActionType.ALERT_ADVISOR_STUCK,
] as const;

/** Reason codes written by HITL applyDecision for timeout_rate denominators. */
export const HITL_DECISION_REASON_CODES = [
  "HITL_TIMEOUT",
  "HITL_APPROVED",
  "HITL_DENIED",
  "HITL_EDITED",
] as const;

export const HITL_TIMEOUT_REASON_CODES = ["HITL_TIMEOUT", "SAFE_HOLD"] as const;

const metricsFixtureSchema = z.object({
  totalClients: z.number().int().min(0),
  /** Distinct clientIds that have at least one escalate-class ledger action. */
  clientsWithEscalation: z.number().int().min(0),
  /** Count of EscalationState rows currently PENDING_APPROVAL. */
  pendingApprovals: z.number().int().min(0),
  /** Ledger rows whose reasonCodes include a HITL terminal decision. */
  hitlDecisions: z.number().int().min(0),
  /** Subset of hitlDecisions that are timeouts / safe-hold. */
  hitlTimeouts: z.number().int().min(0),
  computedAt: z.string().datetime().optional(),
});

export type SlaMetricsFixture = z.infer<typeof metricsFixtureSchema>;

/**
 * Computes firm SLA rates from aggregate counts (pure; no email / network).
 * escalation_rate = clientsWithEscalation / totalClients (0 when no clients).
 * timeout_rate = hitlTimeouts / hitlDecisions (0 when no HITL decisions).
 */
export function computeSlaMetrics(input: SlaMetricsFixture): SlaMetrics {
  const parsed = metricsFixtureSchema.parse(input);
  const escalation_rate =
    parsed.totalClients === 0
      ? 0
      : parsed.clientsWithEscalation / parsed.totalClients;
  const timeout_rate =
    parsed.hitlDecisions === 0
      ? 0
      : parsed.hitlTimeouts / parsed.hitlDecisions;

  return slaMetricsSchema.parse({
    escalation_rate,
    timeout_rate,
    pendingApprovals: parsed.pendingApprovals,
    totalClients: parsed.totalClients,
    clientsWithEscalation: parsed.clientsWithEscalation,
    hitlTimeouts: parsed.hitlTimeouts,
    hitlDecisions: parsed.hitlDecisions,
    computedAt: parsed.computedAt ?? env.DEMO_DATE,
  });
}

/**
 * True when reasonCodes mark a HITL timeout / safe-hold path.
 */
export function isHitlTimeoutReasonCodes(reasonCodes: string[]): boolean {
  return reasonCodes.includes("HITL_TIMEOUT");
}

/**
 * True when reasonCodes mark any terminal HITL advisor/system decision.
 */
export function isHitlTerminalReasonCodes(reasonCodes: string[]): boolean {
  return (
    reasonCodes.includes("HITL_TIMEOUT") ||
    reasonCodes.includes("HITL_APPROVED") ||
    reasonCodes.includes("HITL_DENIED") ||
    reasonCodes.includes("HITL_EDITED")
  );
}

/**
 * True when an ActionType counts toward escalation_rate.
 */
export function isEscalateActionType(actionType: string): boolean {
  return (ESCALATE_ACTION_TYPES as readonly string[]).includes(actionType);
}

export const pendingEscalationStatuses = [
  EscalationStatus.PENDING_APPROVAL,
] as const;

export { ESCALATE_ACTION_TYPES };
