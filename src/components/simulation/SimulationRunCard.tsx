"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Clock, Zap, Activity } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface SimulationRunCardProps {
  run: {
    id: string;
    clientCount: number;
    simulatedDays: number;
    status: string;
    startedAt: string;
    completedAt?: string;
    metrics?: any;
  };
}

export function SimulationRunCard({ run }: SimulationRunCardProps) {
  const duration = run.completedAt 
    ? (new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000
    : null;

  const totalActions = run.metrics?.totalActionsTriggered || 0;
  const throughput = duration && totalActions ? (totalActions / duration).toFixed(1) : null;
  const progress = (run as any).batchesCompleted / (run as any).batchesTotal * 100 || 0;

  return (
    <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-sm hover:border-blue-500/50 transition-colors">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex flex-col">
          <CardTitle className="text-sm font-medium text-slate-400">Run {run.id.substring(run.id.length - 8)}</CardTitle>
          <span className="text-xs text-slate-500">{formatDistanceToNow(new Date(run.startedAt), { addSuffix: true })}</span>
        </div>
        <Badge 
          variant={run.status === "COMPLETED" ? "default" : run.status === "FAILED" ? "destructive" : "secondary"}
          className={run.status === "COMPLETED" ? "bg-green-500/10 text-green-500 border-green-500/20" : ""}
        >
          {run.status}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center space-x-2">
            <Users className="w-4 h-4 text-blue-400" />
            <div className="flex flex-col">
              <span className="text-sm font-semibold">{run.clientCount.toLocaleString()}</span>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">Clients</span>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Clock className="w-4 h-4 text-purple-400" />
            <div className="flex flex-col">
              <span className="text-sm font-semibold">{run.simulatedDays} Days</span>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">Duration</span>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Activity className="w-4 h-4 text-orange-400" />
            <div className="flex flex-col">
              <span className="text-sm font-semibold">{totalActions.toLocaleString()}</span>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">Actions</span>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Zap className="w-4 h-4 text-yellow-400" />
            <div className="flex flex-col">
              <span className="text-sm font-semibold">{throughput || "--"} /s</span>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">Throughput</span>
            </div>
          </div>
        </div>

        {run.status === "RUNNING" && (
          <div className="mt-4">
            <div className="flex justify-between mb-1">
              <span className="text-[10px] text-slate-400 uppercase">Progress</span>
              <span className="text-[10px] text-slate-400 font-medium">{Math.round(progress)}%</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-1">
              <div 
                className="bg-blue-500 h-1 rounded-full transition-all duration-500" 
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
