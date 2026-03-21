import { prisma } from "@/lib/db/client";
import { env } from "@/lib/config";

const CIRCUIT_ID = "singleton";

/** In-flight mutation jobs — do not enqueue another analysis until these complete. */
const ACTIVE_MUTATION_JOB_STATUSES = [
  "pending",
  "analyzing",
  "mutating",
  "shadow_running",
  "gate_evaluating",
] as const;

/**
 * Ensures the singleton circuit row exists (migration inserts it; this is a safety net).
 */
async function ensureCircuitRow(): Promise<void> {
  await prisma.promptMutationCircuitState.upsert({
    where: { id: CIRCUIT_ID },
    create: { id: CIRCUIT_ID },
    update: {},
  });
}

export type MutationEnqueueBlockReason =
  | "ok"
  | "circuit_open"
  | "rejection_cap"
  | "active_pipeline"
  | "cooldown";

export type MutationEnqueueDecision = {
  allowed: boolean;
  reason: MutationEnqueueBlockReason;
  detail?: string;
};

/**
 * Operational wall clock for infra (cooldown / circuit pause). Not vault `DEMO_DATE`.
 */
function operationalNow(): Date {
  return new Date();
}

/**
 * Whether a new mutation-analysis job may be enqueued after a failed eval.
 */
export async function getMutationEnqueueDecision(): Promise<MutationEnqueueDecision> {
  await ensureCircuitRow();

  let circuit = await prisma.promptMutationCircuitState.findUniqueOrThrow({
    where: { id: CIRCUIT_ID },
  });

  const now = operationalNow();

  // Pause window elapsed — allow a fresh attempt (clears runaway-rejection state).
  if (circuit.blockedUntil && circuit.blockedUntil <= now) {
    circuit = await prisma.promptMutationCircuitState.update({
      where: { id: CIRCUIT_ID },
      data: {
        blockedUntil: null,
        consecutiveRejections: 0,
      },
    });
  }

  if (circuit.blockedUntil && circuit.blockedUntil > now) {
    return {
      allowed: false,
      reason: "circuit_open",
      detail: `blocked until ${circuit.blockedUntil.toISOString()}`,
    };
  }

  const maxRej = env.MUTATION_MAX_CONSECUTIVE_REJECTIONS;
  if (maxRej > 0 && circuit.consecutiveRejections >= maxRej) {
    return {
      allowed: false,
      reason: "rejection_cap",
      detail: `${circuit.consecutiveRejections} consecutive gate rejections (cap ${maxRej})`,
    };
  }

  const activeCount = await prisma.promptMutationJob.count({
    where: {
      status: { in: [...ACTIVE_MUTATION_JOB_STATUSES] },
    },
  });
  if (activeCount > 0) {
    return {
      allowed: false,
      reason: "active_pipeline",
      detail: `${activeCount} mutation job(s) still in progress`,
    };
  }

  const cooldownMin = env.MUTATION_COOLDOWN_MINUTES;
  if (cooldownMin > 0 && circuit.lastEnqueueAt) {
    const elapsedMs = now.getTime() - circuit.lastEnqueueAt.getTime();
    const needMs = cooldownMin * 60_000;
    if (elapsedMs < needMs) {
      const waitSec = Math.ceil((needMs - elapsedMs) / 1000);
      return {
        allowed: false,
        reason: "cooldown",
        detail: `wait ~${waitSec}s (cooldown ${cooldownMin} min)`,
      };
    }
  }

  return { allowed: true, reason: "ok" };
}

/**
 * Call after a successful `mutationAnalysisQueue.add` so cooldown applies.
 */
export async function recordMutationEnqueue(): Promise<void> {
  await ensureCircuitRow();
  await prisma.promptMutationCircuitState.update({
    where: { id: CIRCUIT_ID },
    data: { lastEnqueueAt: operationalNow() },
  });
}

/**
 * Call when the regression gate promotes a candidate — clears rejection streak and block.
 */
export async function recordMutationPromoted(): Promise<void> {
  await ensureCircuitRow();
  await prisma.promptMutationCircuitState.update({
    where: { id: CIRCUIT_ID },
    data: {
      consecutiveRejections: 0,
      blockedUntil: null,
    },
  });
}

/**
 * Call when the regression gate rejects all candidates — tightens the circuit.
 */
export async function recordMutationRejected(): Promise<void> {
  await ensureCircuitRow();

  const maxRej = env.MUTATION_MAX_CONSECUTIVE_REJECTIONS;
  const pauseH = env.MUTATION_CIRCUIT_PAUSE_HOURS;

  const updated = await prisma.promptMutationCircuitState.update({
    where: { id: CIRCUIT_ID },
    data: {
      consecutiveRejections: { increment: 1 },
    },
  });

  if (maxRej > 0 && updated.consecutiveRejections >= maxRej) {
    const msg = `[Cerebro] MUTATION CIRCUIT: ${updated.consecutiveRejections} consecutive gate rejections (>= ${maxRej}). `;
    if (pauseH > 0) {
      const until = new Date(operationalNow().getTime() + pauseH * 3_600_000);
      await prisma.promptMutationCircuitState.update({
        where: { id: CIRCUIT_ID },
        data: { blockedUntil: until },
      });
      console.error(
        msg +
          `Auto-pausing new mutation enqueues until ${until.toISOString()} (${pauseH}h). ` +
          `Clear \`PromptMutationCircuitState.blockedUntil\` or reset \`consecutiveRejections\` in DB to resume early.`
      );
    } else {
      console.error(
        msg +
          `New mutation enqueues are blocked until \`consecutiveRejections\` is reset in \`PromptMutationCircuitState\`.`
      );
    }
    // TODO: hook into alerting (Slack, PagerDuty, etc.)
  }
}
