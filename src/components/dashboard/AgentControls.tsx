"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bot, Play, RefreshCw, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function AgentControls({ clients }: { clients: any[] }) {
  const [isTriggering, setIsTriggering] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleTriggerAgent = async (agentType: "COMPLIANCE" | "ONBOARDING") => {
    setIsTriggering(true);
    setStatusMsg(null);
    try {
      // Find a client to test with, or ideally trigger a full sweep
      // Since manual endpoints take clientId, we'll pick the first critical one or just random
      const target = clients.find(c => c.urgency.highest === "CRITICAL" || c.onboardingStatus === "STALLED") || clients[0];
      
      if (!target) throw new Error("No clients available to target.");

      const res = await fetch("/api/agents/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: target.id,
          agentType: agentType,
          trigger: "MANUAL",
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to enqueue job");
      }

      setStatusMsg({ type: "success", text: `Enqueued ${agentType.toLowerCase()} agent for ${target.name}.` });
    } catch (err: any) {
      setStatusMsg({ type: "error", text: err.message || "Failed to trigger agent." });
    } finally {
      setIsTriggering(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-purple-500" />
          Agent Controls
        </CardTitle>
        <CardDescription>Manually enqueue agents for priority processing.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {statusMsg && (
          <Alert variant={statusMsg.type === "error" ? "destructive" : "default"} className={statusMsg.type === "success" ? "border-green-200 bg-green-50 text-green-900" : ""}>
            {statusMsg.type === "error" && <AlertCircle className="h-4 w-4" />}
            <AlertDescription>{statusMsg.text}</AlertDescription>
          </Alert>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Button 
            className="w-full flex items-center justify-start gap-2" 
            variant="outline"
            disabled={isTriggering}
            onClick={() => handleTriggerAgent("COMPLIANCE")}
          >
            {isTriggering ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Sync Compliance
          </Button>
          <Button 
            className="w-full flex items-center justify-start gap-2" 
            variant="outline"
            disabled={isTriggering}
            onClick={() => handleTriggerAgent("ONBOARDING")}
          >
            {isTriggering ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Sync Onboarding
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
