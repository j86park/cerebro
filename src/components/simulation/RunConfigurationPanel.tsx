"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type RunConfigurationPanelProps = {
  clientCount: number;
  simulatedDays: number;
  useMockAgents: boolean;
};

/**
 * Static summary of the last configured run parameters (pairs with NewSimulationDialog).
 */
export function RunConfigurationPanel({
  clientCount,
  simulatedDays,
  useMockAgents,
}: RunConfigurationPanelProps) {
  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="text-slate-200 text-base">Run configuration</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm text-slate-300">
        <div>
          <p className="text-xs uppercase text-slate-500">Clients</p>
          <p className="text-lg font-semibold tabular-nums">
            {clientCount.toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase text-slate-500">Simulated days</p>
          <p className="text-lg font-semibold tabular-nums">{simulatedDays}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-slate-500">Engine</p>
          <p className="text-lg font-semibold">
            {useMockAgents ? "Mock agents" : "Full LLM agents"}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
