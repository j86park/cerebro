import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { env } from "@/lib/config";
import { EscalationStatus, LedgerActor, OnboardingStatus } from "@/lib/db/enums";
import {
  logDecisionInputSchema,
  type LogDecisionInput,
} from "@/lib/observability/decision-log";

const vaultContextSchema = z.object({
  clientId: z.string().min(1),
  now: z.date().optional(),
});

const citedFieldsSchema = z.record(z.unknown()).optional();

const logActionInputSchema = z.object({
  documentId: z.string().optional(),
  agentType: z.string().min(1),
  actionType: z.string().min(1),
  trigger: z.string().min(1),
  reasoning: z.string().min(1),
  outcome: z.string().optional(),
  nextScheduledAt: z.date().optional(),
  stage: z.number().int().optional(),
  policyVersion: z.string().optional(),
  promptVersionId: z.string().optional(),
  actor: z.enum(["AGENT", "ADVISOR", "SYSTEM"]).optional(),
  reasonCodes: z.array(z.string().min(1)).optional(),
  citedFields: citedFieldsSchema,
  /** When set, duplicate inserts for the same client+key no-op and return the existing row. */
  idempotencyKey: z.string().min(1).optional(),
});

const upsertEscalationInputSchema = z.object({
  openKey: z.string().min(1),
  ladderStage: z.number().int().min(0),
  status: z.enum([
    EscalationStatus.OPEN,
    EscalationStatus.PENDING_APPROVAL,
    EscalationStatus.SAFE_HOLD,
  ]),
  documentId: z.string().optional(),
  reasonCodes: z.array(z.string().min(1)).optional(),
  policyVersion: z.string().optional(),
});

const resolveEscalationInputSchema = z.object({
  openKey: z.string().min(1),
  status: z.enum([
    EscalationStatus.RESOLVED,
    EscalationStatus.TIMED_OUT,
  ]),
  reasonCodes: z.array(z.string().min(1)).optional(),
});

const upsertOnboardingStageInputSchema = z.object({
  stage: z.number().int().min(0),
  status: z.enum([
    OnboardingStatus.NOT_STARTED,
    OnboardingStatus.IN_PROGRESS,
    OnboardingStatus.COMPLETED,
    OnboardingStatus.STALLED,
  ]),
  checklistSnapshot: z.record(z.unknown()).optional(),
  stageEnteredAt: z.date().optional(),
});

export type VaultContext = z.infer<typeof vaultContextSchema>;
export type LogActionInput = z.infer<typeof logActionInputSchema>;
export type UpsertEscalationInput = z.infer<typeof upsertEscalationInputSchema>;
export type ResolveEscalationInput = z.infer<typeof resolveEscalationInputSchema>;
export type UpsertOnboardingStageInput = z.infer<
  typeof upsertOnboardingStageInputSchema
>;
export type { LogDecisionInput };

type PrismaLike = {
  client: {
    findUnique: (args: unknown) => Promise<{ id: string } | null>;
    findUniqueOrThrow: (args: unknown) => Promise<unknown>;
    update: (args: unknown) => Promise<unknown>;
  };
  document: {
    findMany: (args: unknown) => Promise<unknown[]>;
    update: (args: unknown) => Promise<unknown>;
    upsert: (args: unknown) => Promise<unknown>;
  };
  agentAction: {
    findMany: (args: unknown) => Promise<unknown[]>;
    findFirst: (args: unknown) => Promise<Record<string, unknown> | null>;
    create: (args: unknown) => Promise<Record<string, unknown>>;
    deleteMany: (args: unknown) => Promise<unknown>;
  };
  escalationState: {
    findMany: (args: unknown) => Promise<unknown[]>;
    findFirst: (args: unknown) => Promise<unknown | null>;
    upsert: (args: unknown) => Promise<unknown>;
    update: (args: unknown) => Promise<unknown>;
  };
  onboardingStage: {
    findUnique: (args: unknown) => Promise<unknown | null>;
    upsert: (args: unknown) => Promise<unknown>;
  };
  decisionRecord: {
    findMany: (args: unknown) => Promise<unknown[]>;
    create: (args: unknown) => Promise<Record<string, unknown>>;
  };
};

const OPEN_ESCALATION_STATUSES = [
  EscalationStatus.OPEN,
  EscalationStatus.PENDING_APPROVAL,
  EscalationStatus.SAFE_HOLD,
] as const;

/**
 * VaultService is the only database access layer for agent and tool code.
 */
export class VaultService {
  private clientId: string;
  private db: PrismaLike;
  private now: Date;

  constructor(ctx: VaultContext, db: PrismaLike = prisma as unknown as PrismaLike) {
    const parsed = vaultContextSchema.parse(ctx);
    this.clientId = parsed.clientId;
    this.db = db;
    this.now = parsed.now ?? new Date(env.DEMO_DATE);
  }

  getNow(): Date {
    return this.now;
  }

  /**
   * Returns whether a client row exists for this vault id (lightweight existence check for APIs).
   */
  async vaultExists(): Promise<boolean> {
    const row = await this.db.client.findUnique({
      where: { id: this.clientId },
      select: { id: true },
    });
    return row !== null;
  }

  /**
   * Returns the client profile scoped to this vault.
   */
  async getClientProfile() {
    return this.db.client.findUniqueOrThrow({
      where: { id: this.clientId },
      include: { advisor: true, firm: true },
    });
  }

  /**
   * Returns all documents scoped to this vault.
   */
  async getDocuments() {
    return this.db.document.findMany({
      where: { clientId: this.clientId },
      orderBy: [{ category: "asc" }, { type: "asc" }],
    });
  }

  /**
   * Returns action history for this vault, newest first.
   */
  async getActionHistory() {
    return this.db.agentAction.findMany({
      where: { clientId: this.clientId },
      orderBy: { performedAt: "desc" },
    });
  }

  /**
   * Writes an append-only examiner DecisionRecord correlated to a Mastra trace / BullMQ job.
   */
  async logDecision(
    input: LogDecisionInput,
  ): Promise<Record<string, unknown> & { id: string }> {
    const parsed = logDecisionInputSchema.parse(input);
    const created = await this.db.decisionRecord.create({
      data: {
        clientId: this.clientId,
        jobId: parsed.jobId,
        agentName: parsed.agentName,
        stage: parsed.stage,
        traceId: parsed.traceId.toLowerCase(),
        policyVersion: parsed.policyVersion,
        policyFired: parsed.policyFired,
        toolProposed: parsed.toolProposed ?? [],
        toolExecuted: parsed.toolExecuted ?? [],
        refusalCodes: parsed.refusalCodes ?? [],
        reviewer: parsed.reviewer,
        outcome: parsed.outcome,
        reason: parsed.reason,
        promptVersionId: parsed.promptVersionId,
        contentCaptured: parsed.contentCaptured ?? false,
        metadata: parsed.metadata,
      },
    });
    return {
      ...created,
      id: String(created.id),
    };
  }

  /**
   * Returns decision history for this vault, newest first when unsorted callers sort;
   * default order is chronological (asc) so a job run reconstructs in decision order.
   */
  async getDecisionHistory(options?: { jobId?: string }) {
    return this.db.decisionRecord.findMany({
      where: {
        clientId: this.clientId,
        ...(options?.jobId ? { jobId: options.jobId } : {}),
      },
      orderBy: { decidedAt: "asc" },
    });
  }

  /**
   * Writes an append-only ActionLedger entry scoped to this vault.
   * When `idempotencyKey` is set, a prior row for the same key is returned (no-op) instead of inserting again.
   */
  async logAction(
    input: LogActionInput,
  ): Promise<Record<string, unknown> & { duplicate: boolean; id: string }> {
    const parsed = logActionInputSchema.parse(input);
    const data = {
      documentId: parsed.documentId,
      agentType: parsed.agentType,
      actionType: parsed.actionType,
      trigger: parsed.trigger,
      reasoning: parsed.reasoning,
      outcome: parsed.outcome,
      nextScheduledAt: parsed.nextScheduledAt,
      stage: parsed.stage,
      policyVersion: parsed.policyVersion,
      promptVersionId: parsed.promptVersionId,
      actor: parsed.actor ?? LedgerActor.AGENT,
      reasonCodes: parsed.reasonCodes ?? [],
      citedFields: parsed.citedFields,
      idempotencyKey: parsed.idempotencyKey,
      clientId: this.clientId,
    };

    if (parsed.idempotencyKey) {
      const existing = await this.db.agentAction.findFirst({
        where: {
          clientId: this.clientId,
          idempotencyKey: parsed.idempotencyKey,
        },
      });
      if (existing) {
        return {
          ...existing,
          id: String(existing.id),
          duplicate: true,
        };
      }
    }

    try {
      const created = await this.db.agentAction.create({ data });
      return {
        ...created,
        id: String(created.id),
        duplicate: false,
      };
    } catch (error: unknown) {
      // Concurrent retry may hit @@unique([clientId, idempotencyKey]); treat as idempotent no-op.
      if (
        parsed.idempotencyKey &&
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code: string }).code === "P2002"
      ) {
        const existing = await this.db.agentAction.findFirst({
          where: {
            clientId: this.clientId,
            idempotencyKey: parsed.idempotencyKey,
          },
        });
        if (existing) {
          return {
            ...existing,
            id: String(existing.id),
            duplicate: true,
          };
        }
      }
      throw error;
    }
  }

  /**
   * Returns open (or all) escalation rows for this vault.
   */
  async getEscalationStates(options?: { openOnly?: boolean }) {
    const openOnly = options?.openOnly ?? false;
    return this.db.escalationState.findMany({
      where: {
        clientId: this.clientId,
        ...(openOnly ? { status: { in: [...OPEN_ESCALATION_STATUSES] } } : {}),
      },
      orderBy: { openedAt: "desc" },
    });
  }

  /**
   * Upserts durable escalation state for an openKey (unique per client while open-like).
   */
  async upsertEscalationState(input: UpsertEscalationInput) {
    const parsed = upsertEscalationInputSchema.parse(input);
    return this.db.escalationState.upsert({
      where: {
        clientId_openKey: {
          clientId: this.clientId,
          openKey: parsed.openKey,
        },
      },
      create: {
        clientId: this.clientId,
        openKey: parsed.openKey,
        ladderStage: parsed.ladderStage,
        status: parsed.status,
        documentId: parsed.documentId,
        reasonCodes: parsed.reasonCodes ?? [],
        policyVersion: parsed.policyVersion,
        openedAt: this.now,
      },
      update: {
        ladderStage: parsed.ladderStage,
        status: parsed.status,
        documentId: parsed.documentId,
        reasonCodes: parsed.reasonCodes ?? [],
        policyVersion: parsed.policyVersion,
        resolvedAt: null,
      },
    });
  }

  /**
   * Resolves an open escalation: clears openKey so a new open escalation may use the same logical key.
   */
  async resolveEscalationState(input: ResolveEscalationInput) {
    const parsed = resolveEscalationInputSchema.parse(input);
    const existing = await this.db.escalationState.findFirst({
      where: {
        clientId: this.clientId,
        openKey: parsed.openKey,
      },
    });
    if (!existing || typeof existing !== "object" || !("id" in existing)) {
      throw new Error(
        `No open escalation with openKey=${parsed.openKey} for client ${this.clientId}`,
      );
    }
    return this.db.escalationState.update({
      where: { id: (existing as { id: string }).id },
      data: {
        status: parsed.status,
        openKey: null,
        resolvedAt: this.now,
        reasonCodes: parsed.reasonCodes,
      },
    });
  }

  /**
   * Returns durable onboarding stage control state for this vault.
   */
  async getOnboardingStageState() {
    return this.db.onboardingStage.findUnique({
      where: { clientId: this.clientId },
    });
  }

  /**
   * Upserts OnboardingStage SoR and mirrors stage/status onto Client.
   */
  async upsertOnboardingStageState(input: UpsertOnboardingStageInput) {
    const parsed = upsertOnboardingStageInputSchema.parse(input);
    const stageEnteredAt = parsed.stageEnteredAt ?? this.now;
    const stageRow = await this.db.onboardingStage.upsert({
      where: { clientId: this.clientId },
      create: {
        clientId: this.clientId,
        stage: parsed.stage,
        status: parsed.status,
        stageEnteredAt,
        checklistSnapshot: parsed.checklistSnapshot,
      },
      update: {
        stage: parsed.stage,
        status: parsed.status,
        stageEnteredAt,
        checklistSnapshot: parsed.checklistSnapshot,
      },
    });
    await this.db.client.update({
      where: { id: this.clientId },
      data: {
        onboardingStage: parsed.stage,
        onboardingStatus: parsed.status,
      },
    });
    return stageRow;
  }

  /**
   * Checks if a duplicate action is being attempted within the cooldown period.
   * Throws an error if the cooldown has not expired.
   */
  async checkActionCooldown(actionType: string, cooldownDays: number, documentId?: string) {
    const history = await this.getActionHistory() as Array<{
      actionType: string;
      documentId: string | null;
      performedAt: Date;
    }>;

    const latest = history.find(
      (h) => h.actionType === actionType && (!documentId || h.documentId === documentId)
    );

    if (latest) {
      const now = this.getNow();
      const daysSince = (now.getTime() - latest.performedAt.getTime()) / (1000 * 60 * 60 * 24);

      if (daysSince < cooldownDays) {
        throw new Error(
          `Action ${actionType} was already performed ${Math.floor(daysSince)} days ago. ` +
          `A cooldown of ${cooldownDays} days is required before repeating this action.`
        );
      }
    }
  }

  /**
   * Updates a document status scoped to this vault.
   */
  async updateDocumentStatus(documentId: string, status: string, notes?: string) {
    const docs = await this.db.document.findMany({
      where: { id: documentId, clientId: this.clientId },
    });

    if (docs.length === 0) {
      throw new Error(`Document ${documentId} not found in client vault ${this.clientId}`);
    }

    return this.db.document.update({
      where: {
        id: documentId,
      },
      data: {
        status,
        notes,
      },
    });
  }

  /**
   * Upserts a document row for this vault.
   */
  async upsertDocument(input: {
    id?: string;
    type: string;
    category: string;
    status: string;
    uploadedAt?: Date;
    expiryDate?: Date;
    notificationCount?: number;
    lastNotifiedAt?: Date;
    fileRef?: string;
    notes?: string;
  }) {
    const id = input.id ?? `${this.clientId}-${input.type}`;
    return this.db.document.upsert({
      where: { id },
      update: {
        ...input,
        clientId: this.clientId,
      },
      create: {
        id,
        ...input,
        clientId: this.clientId,
      },
    });
  }

  /**
   * Resets onboarding stage and status for this vault (Client + OnboardingStage SoR).
   */
  async resetOnboarding(onboardingStage: number, onboardingStatus: string) {
    await this.db.onboardingStage.upsert({
      where: { clientId: this.clientId },
      create: {
        clientId: this.clientId,
        stage: onboardingStage,
        status: onboardingStatus,
        stageEnteredAt: this.now,
      },
      update: {
        stage: onboardingStage,
        status: onboardingStatus,
        stageEnteredAt: this.now,
        checklistSnapshot: Prisma.DbNull,
      },
    });
    return this.db.client.update({
      where: { id: this.clientId },
      data: { onboardingStage, onboardingStatus },
    });
  }

  /**
   * Deletes non-seeded actions for this vault.
   */
  async deleteRuntimeActions() {
    return this.db.agentAction.deleteMany({
      where: {
        clientId: this.clientId,
        NOT: { outcome: "SEEDED_HISTORY" },
      },
    });
  }
}
