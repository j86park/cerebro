"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  REALTIME_CHANNEL_AGENT_ACTIONS,
  REALTIME_TABLE_AGENT_ACTION,
  realtimeChannelAgentActionsForClient,
} from "@/lib/realtime/constants";

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
    setActions(initialActions);
  }, [initialActions]);

  useEffect(() => {
    const channelName = clientId
      ? realtimeChannelAgentActionsForClient(clientId)
      : REALTIME_CHANNEL_AGENT_ACTIONS;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: REALTIME_TABLE_AGENT_ACTION,
          filter: clientId ? `clientId=eq.${clientId}` : undefined,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          const newAction = {
            id: String(row.id),
            agentType: String(row.agentType),
            actionType: String(row.actionType),
            trigger: String(row.trigger),
            reasoning: String(row.reasoning),
            outcome: row.outcome != null ? String(row.outcome) : null,
            performedAt: new Date(String(row.performedAt)).toISOString(),
          } satisfies ActionData;

          setActions((prev) => [newAction, ...prev].slice(0, 50));
        }
      )
      .subscribe((status) => {
        setIsConnected(status === "SUBSCRIBED");
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientId, supabase]);

  return { actions, isConnected };
}
