"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CHART_COLORS } from "@/lib/chart-colors";
import { format } from "date-fns";

interface RegressionTrackerProps {
  runs: {
    id: string;
    overallScore: number;
    runAt: string | Date;
  }[];
}

export function RegressionTracker({ runs }: RegressionTrackerProps) {
  // Sort by date ascending for the chart
  const data = [...runs]
    .sort((a, b) => new Date(a.runAt).getTime() - new Date(b.runAt).getTime())
    .map((run) => ({
      name: format(new Date(run.runAt), "MMM d HH:mm"),
      score: run.overallScore * 100,
      id: run.id,
    }));

  return (
    <Card className="col-span-4">
      <CardHeader>
        <CardTitle>Regression Tracker</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{
                top: 5,
                right: 30,
                left: 20,
                bottom: 5,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="name"
                stroke="var(--muted-foreground)"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="var(--muted-foreground)"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `${value}%`}
                domain={[0, 100]}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--background)",
                  borderColor: "var(--border)",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                itemStyle={{ color: CHART_COLORS.info }}
              />
              <Line
                type="monotone"
                dataKey="score"
                stroke={CHART_COLORS.info}
                strokeWidth={2}
                dot={{ fill: CHART_COLORS.info, r: 4 }}
                activeDot={{ r: 6, strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
