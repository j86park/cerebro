"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CHART_COLORS } from "@/lib/chart-colors";

interface ScorerBreakdownProps {
  breakdown: Record<string, { total: number; passed: number }>;
}

export function ScorerBreakdown({ breakdown }: ScorerBreakdownProps) {
  const data = Object.entries(breakdown).map(([name, stats]) => ({
    name: name.replace("Scorer", ""),
    passRate: (stats.passed / stats.total) * 100,
    passed: stats.passed,
    total: stats.total,
  }));

  return (
    <Card className="col-span-2">
      <CardHeader>
        <CardTitle>Scorer Performance</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              layout="vertical"
              margin={{
                top: 5,
                right: 30,
                left: 20,
                bottom: 5,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
              <XAxis
                type="number"
                stroke="var(--muted-foreground)"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `${value}%`}
                domain={[0, 100]}
              />
              <YAxis
                dataKey="name"
                type="category"
                stroke="var(--muted-foreground)"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                width={100}
              />
              <Tooltip
                cursor={{ fill: "transparent" }}
                contentStyle={{
                  backgroundColor: "var(--background)",
                  borderColor: "var(--border)",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                formatter={(value) => {
                  const v = Array.isArray(value) ? value[0] : value;
                  return [`${Number(v ?? 0).toFixed(1)}%`, "Pass Rate"];
                }}
              />
              <Bar dataKey="passRate" radius={[0, 4, 4, 0]}>
                {data.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.passRate >= 80 ? CHART_COLORS.pass : CHART_COLORS.fail}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
