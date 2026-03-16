"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow, format } from "date-fns";
import { Bot, UserCog, ShieldCheck, FileSearch, Zap, Calendar, History } from "lucide-react";

type ActionData = {
  id: string;
  agentType: string;
  actionType: string;
  trigger: string;
  reasoning: string;
  outcome: string | null;
  performedAt: string;
};

import { useAgentActions } from "@/hooks/useAgentActions";

export function ActionHistoryFeed({ 
  clientId,
  initialActions = [] 
}: { 
  clientId: string; 
  initialActions?: ActionData[];
}) {
  const { actions, isConnected } = useAgentActions(clientId, initialActions);
  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3 border-b border-border shrink-0">
        <CardTitle className="text-lg flex items-center gap-2">
          <History className="h-5 w-5" />
          Agent Activity Feed
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto p-0">
        <div className="divide-y divide-border">
          {actions.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No autonomous actions recorded yet.
            </div>
          ) : (
            actions.map((action) => {
              const date = new Date(action.performedAt);
              const isCompliance = action.agentType === "COMPLIANCE";
              const isSeeded = action.outcome === "SEEDED_HISTORY";
              
              return (
                <div key={action.id} className={`p-4 flex gap-4 ${isSeeded ? "opacity-70 bg-muted/20" : "bg-card hover:bg-muted/30"} transition-colors`}>
                  <div className={`mt-0.5 mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${isCompliance ? "bg-blue-500/10 border-blue-500/20 text-blue-500" : "bg-purple-500/10 border-purple-500/20 text-purple-500"}`}>
                    {isCompliance ? <ShieldCheck className="h-4 w-4" /> : <UserCog className="h-4 w-4" />}
                  </div>
                  
                  <div className="flex-1 space-y-1.5 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold tracking-tight">
                          {action.actionType.replace(/_/g, " ")}
                        </span>
                        {action.trigger === "MANUAL" && <Badge variant="outline" className="text-[10px] h-5 px-1.5 bg-secondary text-secondary-foreground"><UserCog className="h-3 w-3 mr-1"/> Manual</Badge>}
                        {action.trigger === "EVENT_UPLOAD" && <Badge variant="outline" className="text-[10px] h-5 px-1.5 bg-amber-500/10 text-amber-500 border-amber-500/20"><Zap className="h-3 w-3 mr-1"/> Event</Badge>}
                        {action.trigger === "SCHEDULED" && <Badge variant="outline" className="text-[10px] h-5 px-1.5 bg-blue-500/10 text-blue-500 border-blue-500/20"><Calendar className="h-3 w-3 mr-1"/> Scan</Badge>}
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0" title={format(date, "PPpp")}>
                        {formatDistanceToNow(date, { addSuffix: true })}
                      </span>
                    </div>
                    
                    <p className="text-sm text-foreground/90 leading-relaxed">
                      {action.reasoning}
                    </p>
                    
                    {isSeeded && (
                      <div className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground mt-2">
                        Historical Record
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
