import { COMPLIANCE_SYSTEM_PROMPT } from "@/agents/compliance/prompts";
import { ONBOARDING_SYSTEM_PROMPT } from "@/agents/onboarding/prompts";
import { prisma } from "@/lib/db/client";
import { clearAgentRuntimeMemory } from "@/lib/agent-runtime-registry";

const CACHE_TTL_MS = 60_000;

type CacheEntry = { content: string; expiresAt: number };
const promptCache = new Map<string, CacheEntry>();

function hardcodedFallback(agentId: string): string {
  if (agentId === "compliance") return COMPLIANCE_SYSTEM_PROMPT;
  if (agentId === "onboarding") return ONBOARDING_SYSTEM_PROMPT;
  throw new Error(`Unknown agentId for prompt fallback: ${agentId}`);
}

/**
 * Returns the active system prompt for the agent from `PromptVersion`, with in-process cache and file fallback.
 */
export async function loadPrompt(agentId: string): Promise<string> {
  const now = Date.now();
  const hit = promptCache.get(agentId);
  if (hit && hit.expiresAt > now) {
    return hit.content;
  }

  const row = await prisma.promptVersion.findFirst({
    where: { agentId, isActive: true },
    select: { content: true },
  });

  const content = row?.content ?? hardcodedFallback(agentId);
  promptCache.set(agentId, { content, expiresAt: now + CACHE_TTL_MS });
  return content;
}

/**
 * Clears prompt cache and forces the next `get*Agent()` / `getCerebro()` to rebuild.
 */
export function invalidateAgent(agentId: string): void {
  promptCache.delete(agentId);
  clearAgentRuntimeMemory(agentId);
}
