"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_COLORS } from "@/lib/chart-colors";

export type ABComparisonRow = {
  label: string;
  agent: number;
  baseline: number;
};

type ABComparisonChartProps = {
  data: ABComparisonRow[];
  height?: number;
};

/**
 * Primary simulation ROI view: agent vs manual/baseline (frontend.mdc).
 */
export function ABComparisonChart({ data, height = 320 }: ABComparisonChartProps) {
  return (
    <div className="w-full rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <h3 className="text-sm font-semibold text-slate-200 mb-4">
        Agent vs baseline outcomes
      </h3>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="label" tick={{ className: "text-xs fill-slate-400" }} />
          <YAxis tick={{ className: "text-xs fill-slate-400" }} />
          <Tooltip
            contentStyle={{
              backgroundColor: "#0f172a",
              border: "1px solid #334155",
              borderRadius: 8,
            }}
          />
          <Legend />
          <Bar dataKey="agent" name="Agent" fill={CHART_COLORS.blue} radius={[4, 4, 0, 0]} />
          <Bar
            dataKey="baseline"
            name="Baseline"
            fill={CHART_COLORS.gray}
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
