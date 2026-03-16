import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, XCircle, Activity, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface EvalOverviewProps {
  latestRun: {
    overallScore: number;
    runAt: string | Date;
    scorerBreakdown: any;
    scenarioResults: any;
  };
}

export function EvalOverview({ latestRun }: EvalOverviewProps) {
  const scenarioResults = latestRun.scenarioResults || {};
  const totalScenarios = Object.keys(scenarioResults).length;
  const passedScenarios = Object.values(scenarioResults).filter(
    (s: any) => !Object.values(s.scores || {}).some((score: any) => (score.score ?? 0) < 1)
  ).length;
  const failedScenarios = totalScenarios - passedScenarios;

  const metrics = [
    {
      title: "Overall Score",
      value: `${(latestRun.overallScore * 100).toFixed(1)}%`,
      description: "Aggregated scorer performance",
      icon: Activity,
      color: latestRun.overallScore >= 0.8 ? "text-pass" : "text-fail",
    },
    {
      title: "Passing Scenarios",
      value: passedScenarios.toString(),
      description: `Out of ${totalScenarios} total`,
      icon: CheckCircle2,
      color: "text-pass",
    },
    {
      title: "Failing Scenarios",
      value: failedScenarios.toString(),
      description: "Needs attention",
      icon: XCircle,
      color: failedScenarios > 0 ? "text-fail" : "text-muted-foreground",
    },
    {
      title: "Last Run",
      value: formatDistanceToNow(new Date(latestRun.runAt), { addSuffix: true }),
      description: "Evaluation freshiness",
      icon: Clock,
      color: "text-info",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {metrics.map((metric) => (
        <Card key={metric.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{metric.title}</CardTitle>
            <metric.icon className={`h-4 w-4 ${metric.color}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metric.value}</div>
            <p className="text-xs text-muted-foreground">{metric.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
