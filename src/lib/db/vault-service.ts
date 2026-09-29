import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { env } from "@/lib/config";
import { EscalationStatus, LedgerActor, OnboardingStatus } from "@/lib/db/enums";
import {
  documentExtractResultSchema,
  type DocumentExtractResult,
} from "@/lib/documents/extract";
import {
  getSanctionsCheckAdapter,
  sanctionsCheckInputSchema,
  sanctionsCheckResultSchema,
  type SanctionsCheckInput,
  type SanctionsCheckResult,
} from "@/lib/sanctions";
import {
  formatUntrustedDocumentBlock,
  sanitizeDocumentTextForAgentContext,
} from "@/lib/documents/injectionHygiene";
import {
  agentTypeToPromptAgentId,
  resolveProductionPromptVersionId,
} from "@/lib/prompt-ops";
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

const hitlContextSchema = z.record(z.unknown()).optional();

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
  hitlContext: hitlContextSchema,
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
    create: (args: unknown) => Promise<unknown>;
    update: (args: unknown) => Promise<unknown>;
    updateMany: (args: unknown) => Promise<unknown>;
    upsert: (args: unknown) => Promise<unknown>;
  };
  $transaction?: (callback: (tx: PrismaLike) => Promise<unknown>) => Promise<unknown>;
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
   * Returns the vault's fixed clientId (for HITL / enqueue payloads — never for cross-client queries).
   */
  getClientId(): string {
    return this.clientId;
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
   * Returns a single document by id, fail-closed to this vault.
   * Cross-client attempts are audited then thrown.
   */
  async getDocumentById(documentId: string) {
    const id = z.string().min(1).parse(documentId);
    return this.requireDocumentInVault(id);
  }

  /**
   * Loads document body text for agent context: scoped retrieval + injection hygiene.
   */
  async getDocumentContentForAgent(documentId: string): Promise<{
    documentId: string;
    type: string | null;
    text: string;
    strippedPatterns: string[];
    agentContextBlock: string;
  }> {
    const doc = (await this.getDocumentById(documentId)) as {
      id: string;
      type?: string | null;
      notes?: string | null;
    };
    const raw = typeof doc.notes === "string" ? doc.notes : "";
    const sanitized = sanitizeDocumentTextForAgentContext(raw);
    return {
      documentId: doc.id,
      type: typeof doc.type === "string" ? doc.type : null,
      text: sanitized.text,
      strippedPatterns: sanitized.strippedPatterns,
      agentContextBlock: formatUntrustedDocumentBlock({
        documentId: doc.id,
        text: sanitized.text,
      }),
    };
  }

  /**
   * Returns action history for this vault, newest first.
   */
  async getActionHistory() {
    return this.db.agentAction.findMany({
      where: { clientId: this.clientId },
      orderBy: [{ effectiveAt: "desc" }, { performedAt: "desc" }],
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
   * Resolves production `promptVersionId` when the caller omits it (version-on-audit).
   */
  async logAction(
    input: LogActionInput,
  ): Promise<Record<string, unknown> & { duplicate: boolean; id: string }> {
    const parsed = logActionInputSchema.parse(input);

    let promptVersionId = parsed.promptVersionId;
    if (!promptVersionId) {
      const promptAgentId = agentTypeToPromptAgentId(parsed.agentType);
      if (promptAgentId) {
        try {
          promptVersionId =
            (await resolveProductionPromptVersionId(promptAgentId)) ??
            undefined;
        } catch (error: unknown) {
          // Unit stubs / missing prompt tables must not block ledger writes.
          console.error(
            "[VaultService.logAction] promptVersionId resolve failed:",
            error instanceof Error ? error.message : error,
          );
        }
      }
    }

    const data = {
      documentId: parsed.documentId,
      agentType: parsed.agentType,
      actionType: parsed.actionType,
      trigger: parsed.trigger,
      reasoning: parsed.reasoning,
      outcome: parsed.outcome,
      nextScheduledAt: parsed.nextScheduledAt,
      effectiveAt: this.getNow(),
      stage: parsed.stage,
      policyVersion: parsed.policyVersion,
      promptVersionId,
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
        hitlContext: parsed.hitlContext ?? undefined,
        openedAt: this.now,
      },
      update: {
        ladderStage: parsed.ladderStage,
        status: parsed.status,
        documentId: parsed.documentId,
        reasonCodes: parsed.reasonCodes ?? [],
        policyVersion: parsed.policyVersion,
        hitlContext: parsed.hitlContext ?? undefined,
        resolvedAt: null,
      },
    });
  }

  /**
   * Finds an open-like escalation by openKey for this vault (HITL resume lookups).
   */
  async getEscalationStateByOpenKey(openKey: string) {
    const parsed = z.string().min(1).parse(openKey);
    return this.db.escalationState.findFirst({
      where: {
        clientId: this.clientId,
        openKey: parsed,
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
        hitlContext: null,
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
   * Returns true when this vault already has a successful agent-job completion marker
   * for the same agent/trigger/(document) within the given window.
   * Used by BullMQ processors so retries/replays do not re-run side effects.
   * Integrates with ActionLedger unique keys when WP-P0.1 lands — AgentAction is the interim SoR.
   */
  async hasCompletedAgentJob(input: {
    agentType: string;
    trigger: string;
    documentId?: string;
    completedOutcome: string;
    since: Date;
  }): Promise<boolean> {
    const history = (await this.getActionHistory()) as Array<{
      agentType: string;
      trigger: string;
      documentId: string | null;
      outcome: string | null;
      performedAt: Date;
      effectiveAt?: Date | null;
      actionType: string;
    }>;

    return history.some((row) => {
      if (row.outcome !== input.completedOutcome) return false;
      if (row.agentType !== input.agentType) return false;
      if (row.trigger !== input.trigger) return false;
      if (row.actionType !== "SCAN_VAULT") return false;
      if ((row.effectiveAt ?? row.performedAt).getTime() < input.since.getTime()) return false;
      if (input.documentId) {
        return row.documentId === input.documentId;
      }
      return true;
    });
  }

  /**
   * Checks if a duplicate action is being attempted within the cooldown period.
   * Throws an error if the cooldown has not expired.
   */
  async checkActionCooldown(actionType: string, cooldownDays: number, documentId?: string, stage?: number, agentType?: string) {
    const history = await this.getActionHistory() as Array<{
      actionType: string;
      documentId: string | null;
      performedAt: Date;
      effectiveAt?: Date | null;
      stage?: number | null;
      agentType?: string;
      outcome: string | null;
    }>;

    const latest = history.find(
      (h) => h.actionType === actionType && h.outcome !== "POLICY_BLOCKED" &&
        (!documentId || h.documentId === documentId) &&
        (stage === undefined || h.stage === stage) &&
        (agentType === undefined || h.agentType === agentType)
    );

    if (latest) {
      const now = this.getNow();
      const daysSince = (now.getTime() - (latest.effectiveAt ?? latest.performedAt).getTime()) / (1000 * 60 * 60 * 24);

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
    const id = z.string().min(1).parse(documentId);
    const document = await this.requireDocumentInVault(id) as { type: string };

    if (status === "VALID") {
      // Keep historical rows for audit, but do not let an expired predecessor
      // remain an active blocker after its replacement is admitted.
      const admitReplacement = async (db: PrismaLike) => {
        await db.document.updateMany({
          where: { clientId: this.clientId, type: document.type, id: { not: id }, status: { not: "SUPERSEDED" } },
          data: { status: "SUPERSEDED" },
        });
        return db.document.update({ where: { id }, data: { status, notes } });
      };
      return this.db.$transaction
        ? this.db.$transaction(admitReplacement)
        : admitReplacement(this.db);
    }

    return this.db.document.update({
      where: {
        id,
      },
      data: {
        status,
        notes,
      },
    });
  }

  /** Persist a reminder once without changing the document's compliance status. */
  async recordDocumentNotification(input: {
    documentId: string;
    idempotencyKey: string;
    reasoning: string;
    outcome: string;
    nextScheduledAt: Date;
    stage: number;
    policyVersion: string;
    email?: { to: string; subject: string; body: string };
  }): Promise<{ notificationCount: number; duplicate: boolean; outboxId: string | null }> {
    const documentId = z.string().min(1).parse(input.documentId);
    const idempotencyKey = z.string().min(1).parse(input.idempotencyKey);
    let promptVersionId: string | null = null;
    try {
      promptVersionId = await resolveProductionPromptVersionId("compliance");
    } catch (error) {
      console.error("[VaultService.recordDocumentNotification] promptVersionId resolve failed:", error);
    }

    return prisma.$transaction(async (tx) => {
      const document = await tx.document.findFirst({
        where: { id: documentId, clientId: this.clientId },
        select: { id: true },
      });
      if (!document) throw new Error(`Document ${documentId} does not belong to client ${this.clientId}`);

      const inserted = await tx.agentAction.createMany({
        data: [{
          clientId: this.clientId,
          documentId,
          agentType: "COMPLIANCE",
          actionType: "SEND_CLIENT_REMINDER",
          trigger: "SCHEDULED",
          reasoning: input.reasoning,
          outcome: input.outcome,
          nextScheduledAt: input.nextScheduledAt,
          effectiveAt: this.getNow(),
          stage: input.stage,
          policyVersion: input.policyVersion,
          promptVersionId,
          reasonCodes: ["POLICY_ALLOW_AUTO"],
          idempotencyKey,
        }],
        skipDuplicates: true,
      });
      if (inserted.count) {
        await tx.document.update({
          where: { id: documentId },
          data: {
            notificationCount: { increment: 1 },
            lastNotifiedAt: this.getNow(),
          },
        });
        if (input.email) {
          await tx.reminderEmailOutbox.create({ data: {
            clientId: this.clientId,
            documentId,
            idempotencyKey,
            recipient: input.email.to,
            subject: input.email.subject,
            body: input.email.body,
          } });
        }
      }
      const updated = await tx.document.findUniqueOrThrow({
        where: { id: documentId },
        select: { notificationCount: true },
      });
      const outbox = input.email ? await tx.reminderEmailOutbox.findUnique({
        where: { idempotencyKey }, select: { id: true },
      }) : null;
      return { notificationCount: updated.notificationCount, duplicate: inserted.count === 0,
        outboxId: outbox?.id ?? null };
    });
  }

  /**
   * Returns structured extract fields for a vault document (WP-P1.2).
   * Null when no adapter result has been persisted.
   */
  async getDocumentExtractedFields(
    documentId: string,
  ): Promise<DocumentExtractResult | null> {
    const doc = (await this.getDocumentById(documentId)) as {
      extractedFields?: unknown;
    };
    if (doc.extractedFields == null) return null;
    const parsed = documentExtractResultSchema.safeParse(doc.extractedFields);
    if (!parsed.success) {
      throw new Error(
        `Document ${documentId} has invalid extractedFields JSON: ${parsed.error.message}`,
      );
    }
    return parsed.data;
  }

  /**
   * Creates a new document row for this vault (upload path).
   * Optional `notes` are stored as provided — callers must sanitize extracted text first.
   * Optional `extractedFields` must already match DocumentExtractResult (adapter output).
   */
  async createDocument(input: {
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
    extractedFields?: DocumentExtractResult;
  }) {
    const parsed = z
      .object({
        id: z.string().min(1).optional(),
        type: z.string().min(1),
        category: z.string().min(1),
        status: z.string().min(1),
        uploadedAt: z.date().optional(),
        expiryDate: z.date().optional(),
        notificationCount: z.number().int().optional(),
        lastNotifiedAt: z.date().optional(),
        fileRef: z.string().optional(),
        notes: z.string().optional(),
        extractedFields: documentExtractResultSchema.optional(),
      })
      .parse(input);

    const { extractedFields, ...rest } = parsed;

    return this.db.document.create({
      data: {
        ...rest,
        clientId: this.clientId,
        ...(extractedFields !== undefined
          ? { extractedFields: extractedFields as Prisma.InputJsonValue }
          : {}),
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
    extractedFields?: DocumentExtractResult;
  }) {
    const parsed = z
      .object({
        id: z.string().min(1).optional(),
        type: z.string().min(1),
        category: z.string().min(1),
        status: z.string().min(1),
        uploadedAt: z.date().optional(),
        expiryDate: z.date().optional(),
        notificationCount: z.number().int().optional(),
        lastNotifiedAt: z.date().optional(),
        fileRef: z.string().optional(),
        notes: z.string().optional(),
        extractedFields: documentExtractResultSchema.optional(),
      })
      .parse(input);

    const id = parsed.id ?? `${this.clientId}-${parsed.type}`;
    const { extractedFields, id: _omitId, ...rest } = parsed;
    const jsonFields =
      extractedFields !== undefined
        ? { extractedFields: extractedFields as Prisma.InputJsonValue }
        : {};

    return this.db.document.upsert({
      where: { id },
      update: {
        ...rest,
        ...jsonFields,
        clientId: this.clientId,
      },
      create: {
        id,
        ...rest,
        ...jsonFields,
        clientId: this.clientId,
      },
    });
  }

  /**
   * Runs the configured sanctions/PEP check adapter for this vault.
   * REGULATORY: never claims vendor clearance — scaffold returns not_checked /
   * dry_run_skipped / vendor_unavailable with vendorClearanceClaimed=false.
   * No Alloy identity fabric; tools must not invent match/non-match outcomes.
   */
  async checkSanctionsPep(
    input: SanctionsCheckInput,
  ): Promise<SanctionsCheckResult> {
    const parsed = sanctionsCheckInputSchema.parse(input);
    const adapter = getSanctionsCheckAdapter();
    const result = await adapter.check(parsed);
    return sanctionsCheckResultSchema.parse(result);
  }

  /**
   * Persists or replaces structured extract fields on an existing vault document.
   */
  async updateDocumentExtractedFields(
    documentId: string,
    extractedFields: DocumentExtractResult,
  ) {
    const id = z.string().min(1).parse(documentId);
    await this.requireDocumentInVault(id);
    const parsed = documentExtractResultSchema.parse(extractedFields);
    return this.db.document.update({
      where: { id },
      data: {
        extractedFields: parsed as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * Ensures documentId belongs to this vault; audits and throws on cross-client probe.
   */
  private async requireDocumentInVault(documentId: string): Promise<unknown> {
    const scoped = await this.db.document.findMany({
      where: { id: documentId, clientId: this.clientId },
    });
    if (scoped.length > 0) {
      return scoped[0];
    }

    const anyMatch = await this.db.document.findMany({
      where: { id: documentId },
    });
    if (anyMatch.length > 0) {
      await this.auditCrossClientDocumentAccess(documentId);
      throw new Error(
        `Cross-client document access denied: document ${documentId} is not in vault ${this.clientId}`,
      );
    }

    throw new Error(
      `Document ${documentId} not found in client vault ${this.clientId}`,
    );
  }

  /**
   * Writes ActionLedger evidence when a cross-client document access is attempted.
   */
  private async auditCrossClientDocumentAccess(documentId: string): Promise<void> {
    await this.logAction({
      // The probed document belongs to another client; never attach its FK to
      // this vault's ledger row.
      agentType: "SYSTEM",
      actionType: "DOCUMENT_ACCESS_DENIED",
      trigger: "MANUAL",
      reasoning: `Blocked cross-client document retrieval for ${documentId} against vault ${this.clientId}`,
      outcome: "DENIED",
      actor: LedgerActor.SYSTEM,
      reasonCodes: ["CROSS_CLIENT_ACCESS_DENIED"],
      citedFields: {
        documentId,
        vaultClientId: this.clientId,
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
