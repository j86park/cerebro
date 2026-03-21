"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  REALTIME_CHANNEL_AGENT_ACTIONS,
  REALTIME_TABLE_AGENT_ACTION,
} from "@/lib/realtime/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";
import { Activity } from "lucide-react";

export type AgentAction = {
  id: string;
  clientId: string;
  agentType: string;
  actionType: string;
  trigger: string;
  reasoning: string;
  outcome: string | null;
  performedAt: string;
  client?: { name: string };
};

export function LiveAgentActivityFeed({ initialActions }: { initialActions: AgentAction[] }) {
  const [actions, setActions] = useState<AgentAction[]>(initialActions);
  const scrollRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  useEffect(() => {
    setActions(initialActions.slice(0, 50));
  }, [initialActions]);

  useEffect(() => {
    const channel = supabase
      .channel(REALTIME_CHANNEL_AGENT_ACTIONS)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: REALTIME_TABLE_AGENT_ACTION,
        },
        (payload) => {
          const row = payload.new as AgentAction;
          setActions((prev) => [row, ...prev].slice(0, 50));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  const getAgentBadge = (type: string) => {
    switch (type) {
      case "COMPLIANCE":
        return <Badge variant="outline" className="text-blue-500 border-blue-200 bg-blue-50">Compliance</Badge>;
      case "ONBOARDING":
        return <Badge variant="outline" className="text-purple-500 border-purple-200 bg-purple-50">Onboarding</Badge>;
      default:
        return <Badge variant="outline">{type}</Badge>;
    }
  };

  const getTriggerIndicator = (trigger: string, actionType: string, outcome: string | null) => {
    if (outcome === "RESOLVED" || actionType === "MARK_RESOLVED" || actionType === "COMPLETE_ONBOARDING") {
      return <Badge className="bg-green-500 hover:bg-green-600">✅ {actionType}</Badge>;
    }
    if (actionType.includes("ESCALATE") || actionType.includes("ALERT")) {
      return <Badge className="bg-red-500 hover:bg-red-600">🚨 {actionType}</Badge>;
    }
    if (trigger === "EVENT_UPLOAD") {
      return <Badge className="bg-yellow-500 hover:bg-yellow-600 text-black">⚡ {actionType}</Badge>;
    }
    return <Badge variant="secondary">{actionType}</Badge>;
  };

  return (
    <Card className="flex flex-col h-[500px]">
      <CardHeader className="border-b pb-4 shrink-0">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Activity className="h-5 w-5 text-blue-500" />
          Live Agent Activity
          <div className="ml-auto flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
            </span>
            <span className="text-xs text-muted-foreground font-normal">Connected</span>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 p-0 overflow-hidden">
        <ScrollArea className="h-full" ref={scrollRef}>
          <div className="p-4 space-y-4">
            {actions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No recent activity</p>
            ) : (
              actions.map((action) => (
                <div key={action.id} className="flex flex-col gap-1.5 border-b last:border-0 pb-4 last:pb-0 animate-in fade-in slide-in-from-top-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {getAgentBadge(action.agentType)}
                      <span className="text-sm font-medium">{action.client?.name || `Client ${action.clientId.split('-')[1]}`}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(action.performedAt), { addSuffix: true })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {getTriggerIndicator(action.trigger, action.actionType, action.outcome)}
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{action.reasoning}</p>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
