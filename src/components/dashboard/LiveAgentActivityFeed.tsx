"use client";

import { useEffect, useState, useRef } from "react";
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
  const [isStreaming, setIsStreaming] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setActions(initialActions.slice(0, 50));
  }, [initialActions]);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch("/api/agents/actions", { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = await response.json();
        if (active && Array.isArray(body.data)) {
          setActions(body.data);
          setIsRefreshing(true);
        }
      } catch (error) {
        if (active) setIsRefreshing(false);
        console.error("[dashboard] Failed to refresh actions:", error);
      }
    };
    void refresh();
    const events = new EventSource("/api/agents/activity/stream");
    events.onopen = () => { if (active) setIsStreaming(true); };
    events.onerror = () => { if (active) setIsStreaming(false); };
    events.addEventListener("agent_run_complete", () => void refresh());
    const interval = setInterval(() => void refresh(), 5_000);

    return () => {
      active = false;
      clearInterval(interval);
      events.close();
    };
  }, []);

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
              {isStreaming && <span className="animate-ping absolute inline-flex rounded-full h-3 w-3 bg-green-400 opacity-75"></span>}
              <span className={`relative inline-flex rounded-full h-3 w-3 ${isRefreshing ? "bg-green-500" : "bg-red-500"}`}></span>
            </span>
            <span className="text-xs text-muted-foreground font-normal">{!isRefreshing ? "Offline" : isStreaming ? "Live" : "Refreshing"}</span>
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
