"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_COLORS } from "@/lib/chart-colors";

export type TimelinePoint = {
  day: string;
  detected: number;
  resolved: number;
};

type TimelineChartProps = {
  data: TimelinePoint[];
  height?: number;
};

export function TimelineChart({ data, height = 280 }: TimelineChartProps) {
  return (
    <div className="w-full rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <h3 className="text-sm font-semibold text-slate-200 mb-4">
        Issues detected vs resolved
      </h3>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="day" tick={{ className: "text-xs fill-slate-400" }} />
          <YAxis tick={{ className: "text-xs fill-slate-400" }} />
          <Tooltip
            contentStyle={{
              backgroundColor: "#0f172a",
              border: "1px solid #334155",
              borderRadius: 8,
            }}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="detected"
            name="Detected"
            stroke={CHART_COLORS.orange}
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="resolved"
            name="Resolved"
            stroke={CHART_COLORS.green}
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
