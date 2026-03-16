"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type ActionData = {
  id: string;
  agentType: string;
  actionType: string;
  trigger: string;
  reasoning: string;
  outcome: string | null;
  performedAt: string;
};

export function useAgentActions(clientId: string, initialActions: ActionData[]) {
  const [actions, setActions] = useState<ActionData[]>(initialActions);
  const [isConnected, setIsConnected] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    // Reset state if clientId changes and we were already initialized
    setActions(initialActions);

    const channel = supabase
      .channel(clientId ? `cerebro-agent-actions-${clientId}` : "cerebro-agent-actions")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "agent_actions",
          filter: clientId ? `clientId=eq.${clientId}` : undefined,
        },
        (payload) => {
          console.log("Realtime event received", payload.new);
          // Transform db casing if needed, but Prisma matches DB here mostly
          // Map to match ActionData schema expected by the UI
          const newAction = {
            id: payload.new.id,
            agentType: payload.new.agentType,
            actionType: payload.new.actionType,
            trigger: payload.new.trigger,
            reasoning: payload.new.reasoning,
            outcome: payload.new.outcome,
            // Convert to ISO string to match the serialized state
            performedAt: new Date(payload.new.performedAt).toISOString(),
          } as ActionData;

          setActions((prev) => [newAction, ...prev]);
        }
      )
      .subscribe((status) => {
        setIsConnected(status === "SUBSCRIBED");
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientId, supabase, initialActions]);

  return { actions, isConnected };
}
