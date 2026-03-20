/**
 * Single source for Supabase Realtime channel and table names (frontend.mdc + architecture.md).
 * Prisma model `AgentAction` maps to quoted Postgres table `"AgentAction"`.
 */
export const REALTIME_CHANNEL_AGENT_ACTIONS = "cerebro-agent-actions" as const;

export function realtimeChannelAgentActionsForClient(clientId: string): string {
  return `${REALTIME_CHANNEL_AGENT_ACTIONS}-${clientId}`;
}

/** Prisma default table name for the AgentAction model */
export const REALTIME_TABLE_AGENT_ACTION = "AgentAction" as const;

export const REALTIME_TABLE_SIMULATION_RUN = "SimulationRun" as const;

/**
 * Per-run progress channel pattern for simulation UI subscriptions.
 */
export function realtimeChannelSimulationRun(runId: string): string {
  return `cerebro-simulation-${runId}`;
}
