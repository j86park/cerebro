"use client";

import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_COLORS } from "@/lib/chart-colors";

export type FunnelStage = { stage: string; count: number };

const FUNNEL_COLORS = [
  CHART_COLORS.blue,
  CHART_COLORS.yellow,
  CHART_COLORS.orange,
  CHART_COLORS.red,
];

type EscalationFunnelProps = {
  data: FunnelStage[];
  height?: number;
};

export function EscalationFunnel({ data, height = 260 }: EscalationFunnelProps) {
  return (
    <div className="w-full rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <h3 className="text-sm font-semibold text-slate-200 mb-4">
        Escalation funnel
      </h3>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout="vertical" margin={{ left: 16, right: 32 }}>
          <XAxis type="number" tick={{ className: "text-xs fill-slate-400" }} />
          <YAxis
            type="category"
            dataKey="stage"
            width={120}
            tick={{ className: "text-xs fill-slate-400" }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#0f172a",
              border: "1px solid #334155",
              borderRadius: 8,
            }}
          />
          <Bar dataKey="count" radius={[0, 4, 4, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={FUNNEL_COLORS[i % FUNNEL_COLORS.length]} />
            ))}
            <LabelList dataKey="count" position="right" className="text-xs fill-slate-300" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
