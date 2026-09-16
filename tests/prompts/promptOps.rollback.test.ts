import { beforeEach, describe, expect, it, vi } from "vitest";
import { VaultService } from "@/lib/db/vault-service";

const {
  promptVersionFindUnique,
  promptVersionFindFirst,
  promptVersionUpdateMany,
  promptVersionUpdate,
  pointerFindUnique,
  pointerFindMany,
  pointerUpsert,
  pointerUpdate,
  transaction,
  lessonCreate,
  lessonDelete,
  lessonUpdate,
} = vi.hoisted(() => ({
  promptVersionFindUnique: vi.fn(),
  promptVersionFindFirst: vi.fn(),
  promptVersionUpdateMany: vi.fn(),
  promptVersionUpdate: vi.fn(),
  pointerFindUnique: vi.fn(),
  pointerFindMany: vi.fn(),
  pointerUpsert: vi.fn(),
  pointerUpdate: vi.fn(),
  transaction: vi.fn(async (ops: unknown) => ops),
  lessonCreate: vi.fn(),
  lessonDelete: vi.fn(),
  lessonUpdate: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  prisma: {
    promptVersion: {
      findUnique: promptVersionFindUnique,
      findFirst: promptVersionFindFirst,
      updateMany: promptVersionUpdateMany,
      update: promptVersionUpdate,
    },
    promptEnvironmentPointer: {
      findUnique: pointerFindUnique,
      findMany: pointerFindMany,
      upsert: pointerUpsert,
      update: pointerUpdate,
    },
    promptLesson: {
      create: lessonCreate,
      delete: lessonDelete,
      deleteMany: lessonDelete,
      update: lessonUpdate,
      updateMany: lessonUpdate,
    },
    $transaction: transaction,
  },
}));

vi.mock("@/lib/prompt-loader", () => ({
  invalidateAgent: vi.fn(),
  loadPrompt: vi.fn(),
  loadPromptVersion: vi.fn(),
}));

vi.mock("@/lib/agent-runtime-registry", () => ({
  clearAgentRuntimeMemory: vi.fn(),
}));

describe("prompt ops rollback + version-on-audit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    promptVersionUpdateMany.mockResolvedValue({ count: 1 });
    promptVersionUpdate.mockResolvedValue({ id: "pv-x" });
    transaction.mockImplementation(async (ops: unknown) => ops);
  });

  it("rollback restores prior production content pointer", async () => {
    const { rollbackProduction, setEnvironmentPointer } = await import(
      "@/lib/prompt-ops"
    );

    promptVersionFindUnique.mockResolvedValue({
      id: "pv-v2",
      agentId: "compliance",
      content: "PROMPT_V2",
    });

    // First promote-like set: production currently at v1, moving to v2
    pointerFindUnique.mockResolvedValueOnce({
      promptVersionId: "pv-v1",
      previousPromptVersionId: null,
    });
    pointerUpsert.mockResolvedValueOnce({
      agentId: "compliance",
      environment: "PRODUCTION",
      promptVersionId: "pv-v2",
      previousPromptVersionId: "pv-v1",
    });

    await setEnvironmentPointer({
      agentId: "compliance",
      environment: "PRODUCTION",
      promptVersionId: "pv-v2",
    });

    expect(pointerUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          promptVersionId: "pv-v2",
          previousPromptVersionId: "pv-v1",
        }),
      }),
    );
    expect(promptVersionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "pv-v2" },
        data: { isActive: true },
      }),
    );

    // Rollback: production at v2 with previous v1
    pointerFindUnique.mockResolvedValueOnce({
      promptVersionId: "pv-v2",
      previousPromptVersionId: "pv-v1",
      promptVersion: { id: "pv-v2", content: "PROMPT_V2" },
      previousPromptVersion: { id: "pv-v1", content: "PROMPT_V1" },
    });
    pointerUpdate.mockResolvedValueOnce({
      agentId: "compliance",
      environment: "PRODUCTION",
      promptVersionId: "pv-v1",
      previousPromptVersionId: "pv-v2",
    });

    const rolled = await rollbackProduction({ agentId: "compliance" });
    expect(rolled.promptVersionId).toBe("pv-v1");
    expect(pointerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          promptVersionId: "pv-v1",
          previousPromptVersionId: "pv-v2",
        },
      }),
    );
    expect(promptVersionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "pv-v1" },
        data: { isActive: true },
      }),
    );
  });

  it("ledger row includes resolved production promptVersionId for tool side effect", async () => {
    const { resolveProductionPromptVersionId } = await import("@/lib/prompt-ops");

    pointerFindUnique.mockResolvedValueOnce({
      promptVersion: { id: "pv-prod-1", content: "ACTIVE_PROD" },
    });

    const id = await resolveProductionPromptVersionId("compliance");
    expect(id).toBe("pv-prod-1");

    const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "ACT-1",
      ...data,
    }));
    const db = {
      client: {
        findUnique: vi.fn(async () => null),
        findUniqueOrThrow: vi.fn(async () => ({})),
        update: vi.fn(async () => ({})),
      },
      document: {
        findMany: vi.fn(async () => []),
        update: vi.fn(async () => ({})),
        upsert: vi.fn(async () => ({})),
      },
      agentAction: {
        findMany: vi.fn(async () => []),
        findFirst: vi.fn(async () => null),
        create,
        deleteMany: vi.fn(async () => ({})),
      },
      escalationState: {
        findMany: vi.fn(async () => []),
        findFirst: vi.fn(async () => null),
        upsert: vi.fn(async () => ({})),
        update: vi.fn(async () => ({})),
      },
      onboardingStage: {
        findUnique: vi.fn(async () => null),
        upsert: vi.fn(async () => ({})),
      },
    };

    // Ensure resolve path used by VaultService returns production id
    pointerFindUnique.mockResolvedValue({
      promptVersion: { id: "pv-prod-1", content: "ACTIVE_PROD" },
    });

    const vault = new VaultService({ clientId: "CLT-001" }, db as never);
    const result = await vault.logAction({
      agentType: "COMPLIANCE",
      actionType: "SEND_CLIENT_REMINDER",
      trigger: "SCHEDULED",
      reasoning: "KYC expired — sending client reminder under policy.",
      nextScheduledAt: new Date("2026-03-14T00:00:00.000Z"),
    });

    expect(result.duplicate).toBe(false);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientId: "CLT-001",
          promptVersionId: "pv-prod-1",
        }),
      }),
    );
  });

  it("mutation gate promote updates staging pointer only (not production)", async () => {
    const { setEnvironmentPointer } = await import("@/lib/prompt-ops");

    promptVersionFindUnique.mockResolvedValue({
      id: "pv-candidate",
      agentId: "compliance",
      content: "CANDIDATE",
    });
    pointerFindUnique.mockResolvedValue({
      promptVersionId: "pv-staging-old",
      previousPromptVersionId: null,
    });
    pointerUpsert.mockResolvedValue({
      agentId: "compliance",
      environment: "STAGING",
      promptVersionId: "pv-candidate",
      previousPromptVersionId: "pv-staging-old",
    });

    await setEnvironmentPointer({
      agentId: "compliance",
      environment: "STAGING",
      promptVersionId: "pv-candidate",
    });

    expect(pointerUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ environment: "STAGING" }),
      }),
    );
    // Staging moves must not sync isActive / production runtime
    expect(promptVersionUpdate).not.toHaveBeenCalled();
  });

  it("REGULATORY lessons remain append-only (create only; no update/delete API in prompt-ops)", async () => {
    // prompt-ops module must not expose lesson mutation helpers that rewrite text
    const promptOps = await import("@/lib/prompt-ops");
    const exports = Object.keys(promptOps);
    expect(exports).not.toContain("updateLesson");
    expect(exports).not.toContain("deleteLesson");
    expect(exports).not.toContain("rewriteLesson");
    expect(lessonDelete).not.toHaveBeenCalled();
    expect(lessonUpdate).not.toHaveBeenCalled();
  });
});
