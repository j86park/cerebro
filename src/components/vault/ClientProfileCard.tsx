"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui-extensions/StatusBadge";
import { RealUploadDialog } from "@/components/vault/RealUploadDialog";
import { Play, User, Building, Briefcase } from "lucide-react";
import { useState } from "react";

type ProfileProps = {
  clientId: string;
  name: string;
  email: string;
  accountType: string;
  onboardingStatus: string;
  onboardingStage: number;
  advisorName: string;
  firmName: string;
};

export function ClientProfileCard({ profile }: { profile: ProfileProps }) {
  const [triggering, setTriggering] = useState<string | null>(null);

  const handleTrigger = async (agentType: "COMPLIANCE" | "ONBOARDING") => {
    setTriggering(agentType);
    try {
      await fetch(`/api/agents/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: profile.clientId,
          agentType: agentType,
        }),
      });
      // A full refresh or optimistic UI update would happen here
    } catch (error) {
      console.error(`Failed to trigger ${agentType} agent`, error);
    } finally {
      setTimeout(() => setTriggering(null), 1000);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex justify-between items-center">
          <span>Client Profile</span>
          <StatusBadge status={profile.onboardingStatus} />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-sm">
            <User className="h-4 w-4 text-muted-foreground" />
            <div className="font-medium">{profile.name}</div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Briefcase className="h-4 w-4 text-muted-foreground" />
            <div>
              <span className="text-muted-foreground mr-2">Account:</span>
              <Badge variant="outline">{profile.accountType}</Badge>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Building className="h-4 w-4 text-muted-foreground" />
            <div>
              <span className="text-muted-foreground mr-2">Firm:</span>
              {profile.firmName} ({profile.advisorName})
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-border">
          <h4 className="text-sm font-medium mb-3">Onboarding Progress</h4>
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs text-muted-foreground">Stage {profile.onboardingStage} of 4</span>
            <span className="text-xs font-medium">{profile.onboardingStage * 25}%</span>
          </div>
          <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary transition-all duration-500" 
              style={{ width: `${profile.onboardingStage * 25}%` }} 
            />
          </div>
        </div>

        <div className="pt-4 border-t border-border space-y-3">
          <h4 className="text-sm font-medium">Agent Controls</h4>
          <div className="grid grid-cols-2 gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => handleTrigger("ONBOARDING")}
              disabled={triggering !== null}
            >
              <Play className={`mr-2 h-3 w-3 ${triggering === "ONBOARDING" ? "animate-pulse text-primary" : ""}`} />
              Onboarding
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => handleTrigger("COMPLIANCE")}
              disabled={triggering !== null}
            >
              <Play className={`mr-2 h-3 w-3 ${triggering === "COMPLIANCE" ? "animate-pulse text-primary" : ""}`} />
              Compliance
            </Button>
          </div>
          <RealUploadDialog clientId={profile.clientId} />
        </div>
      </CardContent>
    </Card>
  );
}
