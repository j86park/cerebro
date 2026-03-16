import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { env } from "@/lib/config";

const vaultContextSchema = z.object({
  clientId: z.string().min(1),
});

const logActionInputSchema = z.object({
  documentId: z.string().optional(),
  agentType: z.string().min(1),
  actionType: z.string().min(1),
  trigger: z.string().min(1),
  reasoning: z.string().min(1),
  outcome: z.string().optional(),
  nextScheduledAt: z.date(),
});

export type VaultContext = z.infer<typeof vaultContextSchema>;
export type LogActionInput = z.infer<typeof logActionInputSchema>;

type PrismaLike = {
  client: {
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
    create: (args: unknown) => Promise<unknown>;
    deleteMany: (args: unknown) => Promise<unknown>;
  };
};

/**
 * VaultService is the only database access layer for agent and tool code.
 */
export class VaultService {
  private clientId: string;
  private db: PrismaLike;

  constructor(ctx: VaultContext, db: PrismaLike = prisma as unknown as PrismaLike) {
    const parsed = vaultContextSchema.parse(ctx);
    this.clientId = parsed.clientId;
    this.db = db;
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
   * Writes an append-only action log entry scoped to this vault.
   */
  async logAction(input: LogActionInput) {
    const parsed = logActionInputSchema.parse(input);
    return this.db.agentAction.create({
      data: {
        ...parsed,
        clientId: this.clientId,
      },
    });
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
      const demoDate = new Date(env.DEMO_DATE);
      const daysSince = (demoDate.getTime() - latest.performedAt.getTime()) / (1000 * 60 * 60 * 24);
      
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
   * Resets onboarding stage and status for this vault.
   */
  async resetOnboarding(onboardingStage: number, onboardingStatus: string) {
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
