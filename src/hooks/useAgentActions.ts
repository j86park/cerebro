"use client";

import { useEffect, useState } from "react";

type ActionData = {
  id: string;
  agentType: string;
  actionType: string;
  trigger: string;
  reasoning: string;
  outcome: string | null;
  performedAt: string;
  citedFields?: Record<string, unknown> | null;
};

export function useAgentActions(clientId: string, initialActions: ActionData[]) {
  const [actions, setActions] = useState<ActionData[]>(initialActions);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    setActions(initialActions);
  }, [initialActions]);

  useEffect(() => {
    if (!clientId) return;
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/vaults/${encodeURIComponent(clientId)}/actions`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = await response.json();
        if (active && Array.isArray(body.data)) setActions(body.data.slice(0, 50));
      } catch (error) {
        console.error("[vault] Failed to refresh actions:", error);
      }
    };
    void refresh();
    const events = new EventSource("/api/agents/activity/stream");
    events.onopen = () => { if (active) setIsConnected(true); };
    events.onerror = () => { if (active) setIsConnected(false); };
    events.addEventListener("agent_run_complete", (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data) as { clientId?: string };
        if (payload.clientId === clientId) void refresh();
      } catch { /* a malformed notification cannot change the ledger */ }
    });
    const interval = setInterval(() => void refresh(), 5_000);

    return () => {
      active = false;
      clearInterval(interval);
      events.close();
    };
  }, [clientId]);

  return { actions, isConnected };
}
