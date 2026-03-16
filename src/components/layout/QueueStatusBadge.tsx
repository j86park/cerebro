"use client";

import { useQueueStatus } from "@/hooks/useQueueStatus";
import { Badge } from "@/components/ui/badge";

export function QueueStatusBadge() {
  const { status, isLoading } = useQueueStatus(3000);

  if (isLoading || !status) {
    return (
      <div className="flex justify-between items-center text-xs px-2 py-1 bg-muted/50 rounded-md animate-pulse">
        <span className="text-muted-foreground">Queues</span>
        <span className="text-muted-foreground">---</span>
      </div>
    );
  }

  const activeTotal = 
    status.complianceQueue.active + 
    status.onboardingQueue.active + 
    status.defaultQueue.active;

  const waitingTotal = 
    status.complianceQueue.waiting + 
    status.onboardingQueue.waiting + 
    status.defaultQueue.waiting;

  const isIdle = activeTotal === 0 && waitingTotal === 0;

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center text-xs px-2 py-1.5 bg-muted/30 rounded-md border border-border">
        <span className="text-muted-foreground font-medium">System State</span>
        {isIdle ? (
          <Badge variant="outline" className="h-5 px-1.5 text-[10px] bg-green-500/10 text-green-500 border-green-500/20">IDLE</Badge>
        ) : (
          <Badge variant="outline" className="h-5 px-1.5 text-[10px] bg-primary/10 text-primary border-primary/20 animate-pulse">PROCESSING</Badge>
        )}
      </div>
      <div className="flex justify-between text-xs px-2 text-muted-foreground">
        <span>Active Runs</span>
        <span className="font-mono">{activeTotal}</span>
      </div>
      <div className="flex justify-between text-xs px-2 text-muted-foreground">
        <span>Queued</span>
        <span className="font-mono">{waitingTotal}</span>
      </div>
    </div>
  );
}
