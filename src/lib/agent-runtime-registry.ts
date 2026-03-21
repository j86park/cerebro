/**
 * Clears memoized Mastra `Agent` / `Mastra` instances after prompt swaps so the next
 * `get*Agent()` / `getCerebro()` rebuilds with fresh DB-backed instructions.
 */
const agentMemoClearers = new Map<string, Set<() => void>>();
const cerebroMemoClearers = new Set<() => void>();

/**
 * Register a callback that drops this agent's memoized `Agent` singleton.
 */
export function registerAgentMemoClear(agentId: string, fn: () => void): void {
  if (!agentMemoClearers.has(agentId)) {
    agentMemoClearers.set(agentId, new Set());
  }
  agentMemoClearers.get(agentId)!.add(fn);
}

/**
 * Register a callback that drops the memoized `Mastra` instance (`cerebro`).
 */
export function registerCerebroMemoClear(fn: () => void): void {
  cerebroMemoClearers.add(fn);
}

/**
 * Invokes clearers for the given logical agent id (`compliance` | `onboarding`) and all cerebro clearers.
 */
export function clearAgentRuntimeMemory(agentId: string): void {
  agentMemoClearers.get(agentId)?.forEach((fn) => {
    fn();
  });
  cerebroMemoClearers.forEach((fn) => {
    fn();
  });
}
