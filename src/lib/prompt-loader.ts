import { COMPLIANCE_SYSTEM_PROMPT } from "@/agents/compliance/prompts";
import { ONBOARDING_SYSTEM_PROMPT } from "@/agents/onboarding/prompts";
import { prisma } from "@/lib/db/client";
import { clearAgentRuntimeMemory } from "@/lib/agent-runtime-registry";

const CACHE_TTL_MS = 60_000;

type CacheEntry = { id: string | null; content: string; expiresAt: number };
const promptCache = new Map<string, CacheEntry>();

function hardcodedFallback(agentId: string): string {
  if (agentId === "compliance") return COMPLIANCE_SYSTEM_PROMPT;
  if (agentId === "onboarding") return ONBOARDING_SYSTEM_PROMPT;
  throw new Error(`Unknown agentId for prompt fallback: ${agentId}`);
}

export type LoadedPrompt = {
  id: string | null;
  content: string;
};

/**
 * Returns the runtime-active system prompt (`isActive`) for the agent.
 * Production pointer moves sync `isActive` via prompt-ops; shadow evals temporarily flip `isActive`.
 */
export async function loadPromptVersion(agentId: string): Promise<LoadedPrompt> {
  const now = Date.now();
  const hit = promptCache.get(agentId);
  if (hit && hit.expiresAt > now) {
    return { id: hit.id, content: hit.content };
  }

  const row = await prisma.promptVersion.findFirst({
    where: { agentId, isActive: true },
    select: { id: true, content: true },
  });

  const id = row?.id ?? null;
  const content = row?.content ?? hardcodedFallback(agentId);
  promptCache.set(agentId, { id, content, expiresAt: now + CACHE_TTL_MS });
  return { id, content };
}

/**
 * Returns the active system prompt content for the agent from `PromptVersion`, with cache and file fallback.
 */
export async function loadPrompt(agentId: string): Promise<string> {
  const loaded = await loadPromptVersion(agentId);
  return loaded.content;
}

/**
 * Clears prompt cache and forces the next `get*Agent()` / `getCerebro()` to rebuild.
 */
export function invalidateAgent(agentId: string): void {
  promptCache.delete(agentId);
  clearAgentRuntimeMemory(agentId);
}
