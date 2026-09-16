import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { env } from "@/lib/config";
import { queues } from "@/lib/queue/client";
import { enqueueAgentJob, type EnqueueAgentJobResult } from "@/lib/queue/enqueue";
import { agentJobSchema } from "@/lib/queue/jobs";
import { routePkycEvent } from "@/lib/queue/pkycRouter";
import { RiskProfile } from "@/lib/db/enums";

/** REGULATORY: pKYC expiry-proximity window in days vs DEMO_DATE (matches scorecard 30d band). */
export const EXPIRY_PROXIMITY_WINDOW_DAYS = 30;

/**
 * Client fields whose change is material for CDD refresh (not riskProfile — that is its own event).
 * REGULATORY: PII / account-type changes require a refresh path without rebuilding an identity graph.
 */
export const MATERIAL_PROFILE_FIELDS = ["name", "email", "accountType"] as const;

export type MaterialProfileField = (typeof MATERIAL_PROFILE_FIELDS)[number];

const riskProfileSchema = z.enum([
  RiskProfile.CONSERVATIVE,
  RiskProfile.MODERATE,
  RiskProfile.AGGRESSIVE,
]);

const profileSnapshotSchema = z.object({
  name: z.string().optional(),
  email: z.string().optional(),
  accountType: z.string().optional(),
  riskProfile: riskProfileSchema.nullable().optional(),
  onboardingStatus: z.string().optional(),
});

export type ProfileSnapshot = z.infer<typeof profileSnapshotSchema>;

export type PkycEnqueueSummary = {
  enqueued: number;
  deduplicated: number;
  skipped: number;
  jobs: EnqueueAgentJobResult[];
};

/**
 * Sanitizes a free-form token into a BullMQ-safe eventKey segment.
 */
export function toEventKeySegment(raw: string): string {
  return raw.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64);
}

/**
 * Diffs two profile snapshots into pKYC events (risk-tier and/or material fields).
 * Pure / deterministic — no LLM.
 */
export function classifyProfileChange(
  before: ProfileSnapshot,
  after: ProfileSnapshot
): {
  riskTierChanged: boolean;
  previousRisk: string | null;
  newRisk: string | null;
  materialFields: MaterialProfileField[];
} {
  const prev = profileSnapshotSchema.parse(before);
  const next = profileSnapshotSchema.parse(after);

  const previousRisk = prev.riskProfile ?? null;
  const newRisk = next.riskProfile ?? null;
  const riskTierChanged =
    previousRisk !== newRisk && (previousRisk !== null || newRisk !== null);

  const materialFields = MATERIAL_PROFILE_FIELDS.filter((field) => {
    const a = prev[field] ?? null;
    const b = next[field] ?? null;
    return a !== b;
  });

  return { riskTierChanged, previousRisk, newRisk, materialFields };
}

/**
 * Enqueues deterministic priority jobs for risk-tier and/or material profile changes.
 */
export async function enqueuePkycProfileChangeEvents(input: {
  clientId: string;
  before: ProfileSnapshot;
  after: ProfileSnapshot;
}): Promise<PkycEnqueueSummary> {
  const clientId = z.string().min(1).parse(input.clientId);
  const classified = classifyProfileChange(input.before, input.after);
  const onboardingStatus =
    input.after.onboardingStatus ?? input.before.onboardingStatus;

  const summary: PkycEnqueueSummary = {
    enqueued: 0,
    deduplicated: 0,
    skipped: 0,
    jobs: [],
  };

  if (classified.riskTierChanged) {
    const eventKey = toEventKeySegment(
      `${classified.previousRisk ?? "NONE"}-to-${classified.newRisk ?? "NONE"}`
    );
    const route = routePkycEvent({
      trigger: "EVENT_RISK_TIER_CHANGE",
      onboardingStatus,
    });
    for (const agentType of route.agentTypes) {
      const payload = agentJobSchema.parse({
        clientId,
        agentType,
        trigger: "EVENT_RISK_TIER_CHANGE",
        eventKey,
      });
      const result = await enqueueAgentJob(queues.priority, payload, {
        priority: 1,
      });
      summary.jobs.push(result);
      if (result.deduplicated) summary.deduplicated += 1;
      else summary.enqueued += 1;
    }
  }

  if (classified.materialFields.length > 0) {
    const eventKey = toEventKeySegment(
      [...classified.materialFields].sort().join("-")
    );
    const route = routePkycEvent({
      trigger: "EVENT_PROFILE_MATERIAL_CHANGE",
      onboardingStatus,
    });
    for (const agentType of route.agentTypes) {
      const payload = agentJobSchema.parse({
        clientId,
        agentType,
        trigger: "EVENT_PROFILE_MATERIAL_CHANGE",
        eventKey,
      });
      const result = await enqueueAgentJob(queues.priority, payload, {
        priority: 1,
      });
      summary.jobs.push(result);
      if (result.deduplicated) summary.deduplicated += 1;
      else summary.enqueued += 1;
    }
  }

  if (
    !classified.riskTierChanged &&
    classified.materialFields.length === 0
  ) {
    summary.skipped = 1;
  }

  return summary;
}

/**
 * Scans documents with expiryDate inside the DEMO_DATE proximity window and
 * enqueues EVENT_EXPIRY_PROXIMITY jobs (Compliance → priority) with deterministic jobIds.
 */
export async function enqueueExpiryProximityTriggers(): Promise<
  PkycEnqueueSummary & { documentCount: number }
> {
  const demoDate = new Date(env.DEMO_DATE);
  const windowEnd = new Date(
    demoDate.getTime() + EXPIRY_PROXIMITY_WINDOW_DAYS * 24 * 60 * 60 * 1000
  );

  const documents = await prisma.document.findMany({
    where: {
      expiryDate: {
        gte: demoDate,
        lte: windowEnd,
      },
      status: { not: "MISSING" },
    },
    select: { id: true, clientId: true },
  });

  const summary: PkycEnqueueSummary & { documentCount: number } = {
    enqueued: 0,
    deduplicated: 0,
    skipped: 0,
    jobs: [],
    documentCount: documents.length,
  };

  const route = routePkycEvent({ trigger: "EVENT_EXPIRY_PROXIMITY" });

  for (const doc of documents) {
    for (const agentType of route.agentTypes) {
      const payload = agentJobSchema.parse({
        clientId: doc.clientId,
        agentType,
        trigger: "EVENT_EXPIRY_PROXIMITY",
        documentId: doc.id,
      });
      const result = await enqueueAgentJob(queues.priority, payload, {
        priority: 1,
      });
      summary.jobs.push(result);
      if (result.deduplicated) summary.deduplicated += 1;
      else summary.enqueued += 1;
    }
  }

  return summary;
}

const sanctionsStubSchema = z.object({
  clientId: z.string().min(1),
  /** Vendor hit id or synthetic key — required for jobId stability. */
  hitId: z.string().min(1),
});

/**
 * Stub hook for future sanctions/PEP vendor feeds.
 * Validates + enqueues a Compliance priority job only — does not call any external vendor.
 * Stop/escalate before wiring real credentials.
 */
export async function enqueueSanctionsPepStub(
  input: z.infer<typeof sanctionsStubSchema>
): Promise<PkycEnqueueSummary> {
  const parsed = sanctionsStubSchema.parse(input);
  const route = routePkycEvent({ trigger: "EVENT_SANCTIONS_PEP" });
  const summary: PkycEnqueueSummary = {
    enqueued: 0,
    deduplicated: 0,
    skipped: 0,
    jobs: [],
  };

  for (const agentType of route.agentTypes) {
    const payload = agentJobSchema.parse({
      clientId: parsed.clientId,
      agentType,
      trigger: "EVENT_SANCTIONS_PEP",
      eventKey: toEventKeySegment(parsed.hitId),
    });
    const result = await enqueueAgentJob(queues.priority, payload, {
      priority: 1,
    });
    summary.jobs.push(result);
    if (result.deduplicated) summary.deduplicated += 1;
    else summary.enqueued += 1;
  }

  return summary;
}
