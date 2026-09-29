"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { OutcomeSummaryCards } from "@/components/simulation/OutcomeSummaryCards";
import type { OutcomeSummaryMetrics } from "@/components/simulation/OutcomeSummaryCards";
import { RealtimeProgressFeed } from "@/components/simulation/RealtimeProgressFeed";
import { EscalationFunnel } from "@/components/simulation/EscalationFunnel";
import { RunComparisonTable } from "@/components/simulation/RunComparisonTable";
import { RunConfigurationPanel } from "@/components/simulation/RunConfigurationPanel";

type RunRow = {
  id: string;
  status: string;
  clientCount: number;
  simulatedDays: number;
  batchesCompleted: number;
  batchesTotal: number;
  metrics?: unknown;
  startedAt: string;
};

function defaultSummary(): OutcomeSummaryMetrics {
  return {
    onboardingCompletedByAgent: 0,
    clientsWithUnresolvedDocuments: 0,
    documentsNeedingAttention: 0,
    simulatedDaysProcessed: 0,
  };
}

function summaryFromMetrics(raw: unknown): OutcomeSummaryMetrics {
  if (!raw || typeof raw !== "object") return defaultSummary();
  const m = raw as Record<string, unknown>;
  const num = (k: string) => typeof m[k] === "number" && Number.isFinite(m[k]) ? m[k] as number : 0;
  return {
    onboardingCompletedByAgent: num("onboardingCompletedByAgent"),
    clientsWithUnresolvedDocuments: num("clientsWithUnresolvedDocuments"),
    documentsNeedingAttention: num("documentsNeedingAttention"),
    simulatedDaysProcessed: num("simulatedDaysProcessed"),
  };
}

/**
 * Composed simulation visualization (milestones §9) — A/B chart first per frontend.mdc.
 */
export function SimulationAnalytics() {
  const [runs, setRuns] = useState<RunRow[]>([]);

  const loadRuns = useCallback(async () => {
    const res = await fetch("/api/simulation/runs");
    if (!res.ok) return;
    const body = await res.json();
    const list: RunRow[] = body.data?.runs ?? body.runs ?? [];
    setRuns(list);
  }, []);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  const latest = runs[0];
  const summary = useMemo(
    () => summaryFromMetrics(latest?.metrics),
    [latest?.metrics]
  );

  const funnelData = useMemo(
    () => {
      const m = latest?.metrics as Record<string, unknown> | undefined;
      const count = (key: string) => typeof m?.[key] === "number" ? m[key] as number : 0;
      return [
        { stage: "Client reminders", count: count("clientReminders") },
        { stage: "Advisor alerts", count: count("advisorAlerts") },
        { stage: "Compliance officer", count: count("complianceOfficerEscalations") },
        { stage: "Management", count: count("managementEscalations") },
      ];
    },
    [latest?.metrics]
  );

  const comparisonRows = useMemo(
    () =>
      runs.slice(0, 5).map((r) => {
        const m = r.metrics as { totalActionsTriggered?: number } | undefined;
        return {
          id: r.id,
          startedAt: r.startedAt,
          status: r.status,
          clientCount: r.clientCount,
          simulatedDays: r.simulatedDays,
          totalActions: m?.totalActionsTriggered,
        };
      }),
    [runs]
  );

  return (
    <div className="space-y-8">
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-400">
        Agent vs baseline comparison is unavailable: no measured baseline run is attached. A completed batch run does not mean every client workflow completed.
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <OutcomeSummaryCards metrics={summary} />
          <EscalationFunnel data={funnelData} />
        </div>
        <div className="space-y-6">
          <RunConfigurationPanel
            clientCount={latest?.clientCount ?? 100}
            simulatedDays={latest?.simulatedDays ?? 7}
            useMockAgents={
              (latest?.metrics as { useMockAgents?: boolean } | undefined)
                ?.useMockAgents ?? true
            }
          />
          {latest ? (
            <RealtimeProgressFeed
              runId={latest.id}
              initialLines={[
                {
                  id: "boot",
                  message: `Tracking run ${latest.id.slice(-8)} (${latest.status})`,
                  at: new Date(latest.startedAt).toISOString(),
                },
              ]}
            />
          ) : null}
        </div>
      </div>

      <RunComparisonTable runs={comparisonRows} />
    </div>
  );
}
