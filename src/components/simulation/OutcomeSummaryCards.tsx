"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type OutcomeSummaryMetrics = {
  issuesDetected: number;
  issuesResolved: number;
  escalations: number;
  avgResolutionDays: number;
};

type OutcomeSummaryCardsProps = {
  metrics: OutcomeSummaryMetrics;
};

/**
 * Four headline metric cards for the simulation dashboard (milestones §9).
 */
export function OutcomeSummaryCards({ metrics }: OutcomeSummaryCardsProps) {
  const items: { title: string; value: string; hint: string }[] = [
    {
      title: "Issues detected",
      value: metrics.issuesDetected.toLocaleString(),
      hint: "Across simulated clients",
    },
    {
      title: "Issues resolved",
      value: metrics.issuesResolved.toLocaleString(),
      hint: "Agent + advisor path",
    },
    {
      title: "Escalations",
      value: metrics.escalations.toLocaleString(),
      hint: "Compliance / management",
    },
    {
      title: "Avg. resolution (days)",
      value: metrics.avgResolutionDays.toFixed(1),
      hint: "Simulated calendar",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {items.map((item) => (
        <Card
          key={item.title}
          className="bg-slate-900/50 border-slate-800 text-slate-100"
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-slate-400">
              {item.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums">{item.value}</p>
            <p className="text-[11px] text-slate-500 mt-1">{item.hint}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
