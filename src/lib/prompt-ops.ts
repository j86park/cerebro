import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { PromptEnvironment } from "@/lib/db/enums";
import { invalidateAgent } from "@/lib/prompt-loader";

export const promptEnvironmentSchema = z.enum([
  PromptEnvironment.STAGING,
  PromptEnvironment.PRODUCTION,
]);

export type PromptEnv = z.infer<typeof promptEnvironmentSchema>;

const agentIdSchema = z.enum(["compliance", "onboarding"]);

export type PromptAgentId = z.infer<typeof agentIdSchema>;

const setPointerInputSchema = z.object({
  agentId: agentIdSchema,
  environment: promptEnvironmentSchema,
  promptVersionId: z.string().min(1),
  /** When true, skip recording previous (initial seed). */
  skipPrevious: z.boolean().optional(),
});

const promoteInputSchema = z.object({
  agentId: agentIdSchema,
});

export type ResolvedPromptVersion = {
  id: string | null;
  agentId: string;
  content: string;
  environment: PromptEnv;
  source: "pointer" | "isActive" | "fallback";
};

/**
 * Maps ledger AgentType enum values to prompt agent ids.
 */
export function agentTypeToPromptAgentId(
  agentType: string,
): PromptAgentId | null {
  if (agentType === "COMPLIANCE") return "compliance";
  if (agentType === "ONBOARDING") return "onboarding";
  return null;
}

/**
 * Syncs `PromptVersion.isActive` to match the production pointer for runtime/shadow compatibility.
 */
async function syncIsActiveToProduction(
  agentId: string,
  productionVersionId: string,
): Promise<void> {
  await prisma.$transaction([
    prisma.promptVersion.updateMany({
      where: { agentId, isActive: true },
      data: { isActive: false },
    }),
    prisma.promptVersion.update({
      where: { id: productionVersionId },
      data: { isActive: true },
    }),
  ]);
  invalidateAgent(agentId);
}

/**
 * Sets (or upserts) an environment pointer. Production moves also sync `isActive`.
 * REGULATORY: does not rewrite PromptVersion content — pointers move only.
 */
export async function setEnvironmentPointer(
  input: z.infer<typeof setPointerInputSchema>,
): Promise<{
  agentId: string;
  environment: PromptEnv;
  promptVersionId: string;
  previousPromptVersionId: string | null;
}> {
  const parsed = setPointerInputSchema.parse(input);

  const version = await prisma.promptVersion.findUnique({
    where: { id: parsed.promptVersionId },
  });
  if (!version || version.agentId !== parsed.agentId) {
    throw new Error(
      `setEnvironmentPointer: version ${parsed.promptVersionId} is not a ${parsed.agentId} PromptVersion`,
    );
  }

  const existing = await prisma.promptEnvironmentPointer.findUnique({
    where: {
      agentId_environment: {
        agentId: parsed.agentId,
        environment: parsed.environment,
      },
    },
  });

  const previousPromptVersionId = parsed.skipPrevious
    ? null
    : (existing?.promptVersionId ?? null);

  const row = await prisma.promptEnvironmentPointer.upsert({
    where: {
      agentId_environment: {
        agentId: parsed.agentId,
        environment: parsed.environment,
      },
    },
    create: {
      agentId: parsed.agentId,
      environment: parsed.environment,
      promptVersionId: parsed.promptVersionId,
      previousPromptVersionId: null,
    },
    update: {
      promptVersionId: parsed.promptVersionId,
      previousPromptVersionId,
    },
  });

  if (parsed.environment === PromptEnvironment.PRODUCTION) {
    await syncIsActiveToProduction(parsed.agentId, parsed.promptVersionId);
  }

  return {
    agentId: row.agentId,
    environment: row.environment as PromptEnv,
    promptVersionId: row.promptVersionId,
    previousPromptVersionId: row.previousPromptVersionId,
  };
}

/**
 * Promotes the current staging pointer to production (human-gated).
 * REGULATORY: unsupervised mutation gate must not call this for production compliance prompts.
 */
export async function promoteStagingToProduction(
  input: z.infer<typeof promoteInputSchema>,
): Promise<{
  agentId: string;
  promptVersionId: string;
  previousPromptVersionId: string | null;
}> {
  const { agentId } = promoteInputSchema.parse(input);

  const staging = await prisma.promptEnvironmentPointer.findUnique({
    where: {
      agentId_environment: {
        agentId,
        environment: PromptEnvironment.STAGING,
      },
    },
  });
  if (!staging) {
    throw new Error(
      `promoteStagingToProduction: no staging pointer for ${agentId}`,
    );
  }

  const result = await setEnvironmentPointer({
    agentId,
    environment: PromptEnvironment.PRODUCTION,
    promptVersionId: staging.promptVersionId,
  });

  return {
    agentId: result.agentId,
    promptVersionId: result.promptVersionId,
    previousPromptVersionId: result.previousPromptVersionId,
  };
}

/**
 * Restores production to `previousPromptVersionId` without redeploy.
 */
export async function rollbackProduction(
  input: z.infer<typeof promoteInputSchema>,
): Promise<{
  agentId: string;
  promptVersionId: string;
  previousPromptVersionId: string | null;
}> {
  const { agentId } = promoteInputSchema.parse(input);

  const production = await prisma.promptEnvironmentPointer.findUnique({
    where: {
      agentId_environment: {
        agentId,
        environment: PromptEnvironment.PRODUCTION,
      },
    },
    include: {
      promptVersion: { select: { id: true, content: true } },
      previousPromptVersion: { select: { id: true, content: true } },
    },
  });

  if (!production?.previousPromptVersionId) {
    throw new Error(
      `rollbackProduction: no previous production version for ${agentId}`,
    );
  }

  const priorId = production.previousPromptVersionId;
  const currentId = production.promptVersionId;

  const row = await prisma.promptEnvironmentPointer.update({
    where: {
      agentId_environment: {
        agentId,
        environment: PromptEnvironment.PRODUCTION,
      },
    },
    data: {
      promptVersionId: priorId,
      // Keep the rolled-away version as previous so a second rollback can re-promote.
      previousPromptVersionId: currentId,
    },
  });

  await syncIsActiveToProduction(agentId, priorId);

  return {
    agentId,
    promptVersionId: row.promptVersionId,
    previousPromptVersionId: row.previousPromptVersionId,
  };
}

/**
 * Reads staging + production pointers for an agent (ops / UI).
 */
export async function getEnvironmentPointers(agentId: string): Promise<
  Array<{
    environment: PromptEnv;
    promptVersionId: string;
    previousPromptVersionId: string | null;
    contentPreview: string;
    mutationReason: string | null;
    createdAt: Date;
  }>
> {
  const parsed = agentIdSchema.parse(agentId);
  const rows = await prisma.promptEnvironmentPointer.findMany({
    where: { agentId: parsed },
    include: {
      promptVersion: {
        select: {
          id: true,
          content: true,
          mutationReason: true,
          createdAt: true,
        },
      },
    },
  });

  return rows.map((r) => ({
    environment: r.environment as PromptEnv,
    promptVersionId: r.promptVersionId,
    previousPromptVersionId: r.previousPromptVersionId,
    contentPreview: r.promptVersion.content.slice(0, 200),
    mutationReason: r.promptVersion.mutationReason,
    createdAt: r.promptVersion.createdAt,
  }));
}

/**
 * Resolves prompt content + version id for an environment (default production).
 */
export async function resolvePromptVersion(
  agentId: string,
  environment: PromptEnv = PromptEnvironment.PRODUCTION,
): Promise<ResolvedPromptVersion> {
  const parsedAgent = agentIdSchema.safeParse(agentId);
  if (!parsedAgent.success) {
    throw new Error(`resolvePromptVersion: unknown agentId ${agentId}`);
  }

  const pointer = await prisma.promptEnvironmentPointer.findUnique({
    where: {
      agentId_environment: {
        agentId: parsedAgent.data,
        environment,
      },
    },
    include: {
      promptVersion: { select: { id: true, content: true } },
    },
  });

  if (pointer?.promptVersion) {
    return {
      id: pointer.promptVersion.id,
      agentId: parsedAgent.data,
      content: pointer.promptVersion.content,
      environment,
      source: "pointer",
    };
  }

  const active = await prisma.promptVersion.findFirst({
    where: { agentId: parsedAgent.data, isActive: true },
    select: { id: true, content: true },
  });

  if (active) {
    return {
      id: active.id,
      agentId: parsedAgent.data,
      content: active.content,
      environment,
      source: "isActive",
    };
  }

  return {
    id: null,
    agentId: parsedAgent.data,
    content: "",
    environment,
    source: "fallback",
  };
}

/**
 * Returns the production `promptVersionId` for ActionLedger stamping (null if unresolved).
 */
export async function resolveProductionPromptVersionId(
  agentId: string,
): Promise<string | null> {
  const resolved = await resolvePromptVersion(
    agentId,
    PromptEnvironment.PRODUCTION,
  );
  return resolved.id;
}
