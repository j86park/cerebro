"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Minus } from "lucide-react";

interface ScenarioMatrixProps {
  results: Record<
    string,
    {
      agent: string;
      output?: string;
      scores: Record<string, { score?: number; reason?: string }>;
    }
  >;
  onCellClick: (clientId: string, scorerId: string) => void;
}

export function ScenarioMatrix({ results, onCellClick }: ScenarioMatrixProps) {
  const scenarioIds = Object.keys(results).sort();
  
  // Get all unique scorer IDs across all results
  const scorerIds = Array.from(
    new Set(
      Object.values(results).flatMap((r) => Object.keys(r.scores))
    )
  ).sort();

  return (
    <Card className="col-span-4 overflow-hidden">
      <CardHeader>
        <CardTitle>Scenario Matrix</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-4 font-medium text-muted-foreground w-32">Scenario</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground w-24">Agent</th>
                {scorerIds.map((id) => (
                  <th key={id} className="text-center py-3 px-4 font-medium text-muted-foreground min-w-[120px]">
                    {id.replace("Scorer", "")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scenarioIds.map((clientId) => {
                const result = results[clientId];
                return (
                  <tr key={clientId} className="border-b border-border hover:bg-muted/50 transition-colors">
                    <td className="py-3 px-4 font-mono font-medium">{clientId}</td>
                    <td className="py-3 px-4">
                      <Badge 
                        variant="secondary"
                        className={result.agent === "COMPLIANCE" ? "bg-violet-500/10 text-violet-500" : "bg-cyan-500/10 text-cyan-500"}
                      >
                        {result.agent}
                      </Badge>
                    </td>
                    {scorerIds.map((scorerId) => {
                      const scoreData = result.scores[scorerId];
                      if (!scoreData) {
                        return (
                          <td key={scorerId} className="py-3 px-4 text-center">
                            <Minus className="h-4 w-4 mx-auto text-muted-foreground/30" />
                          </td>
                        );
                      }

                      const isPass = scoreData.score === 1;
                      return (
                        <td 
                          key={scorerId} 
                          className="py-3 px-4 text-center cursor-pointer hover:bg-muted/80 transition-colors group"
                          onClick={() => onCellClick(clientId, scorerId)}
                        >
                          {isPass ? (
                            <CheckCircle2 className="h-4 w-4 mx-auto text-pass group-hover:scale-110 transition-transform" />
                          ) : (
                            <XCircle className="h-4 w-4 mx-auto text-fail group-hover:scale-110 transition-transform" />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
