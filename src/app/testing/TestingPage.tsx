"use client";

import { useState } from "react";
import { EvalOverview } from "@/components/testing/EvalOverview";
import { RegressionTracker } from "@/components/testing/RegressionTracker";
import { ScorerBreakdown } from "@/components/testing/ScorerBreakdown";
import { ScenarioMatrix } from "@/components/testing/ScenarioMatrix";
import { FailureInspector } from "@/components/testing/FailureInspector";
import { GROUND_TRUTH } from "@/evals/ground-truth";

export default function TestingPage({ 
  runsInitial 
}: { 
  runsInitial: any[] 
}) {
  const [runs] = useState(runsInitial);
  const [selectedCell, setSelectedCell] = useState<{
    clientId: string;
    scorerId: string;
  } | null>(null);

  const latestRun = runs[0];

  const handleCellClick = (clientId: string, scorerId: string) => {
    setSelectedCell({ clientId, scorerId });
  };

  const getInspectorData = () => {
    if (!selectedCell || !latestRun) return null;
    const { clientId, scorerId } = selectedCell;
    const scenarioResult = (latestRun.scenarioResults as any)[clientId];
    const scoreData = scenarioResult?.scores[scorerId];
    const groundTruth = GROUND_TRUTH.find(g => g.clientId === clientId);

    return {
      clientId,
      agent: scenarioResult.agent,
      scorerId,
      score: scoreData.score,
      reason: scoreData.reason,
      output: scenarioResult.output,
      expected: groundTruth?.expected,
    };
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {latestRun ? (
        <>
          <EvalOverview 
            latestRun={{
              overallScore: latestRun.overallScore,
              runAt: latestRun.runAt,
              scorerBreakdown: latestRun.scorerBreakdown,
              scenarioResults: latestRun.scenarioResults,
            }} 
          />
          <div className="grid gap-8 grid-cols-1 lg:grid-cols-4">
            <div className="lg:col-span-4">
              <RegressionTracker 
                runs={runs.map((r: any) => ({
                  id: r.id,
                  overallScore: r.overallScore,
                  runAt: r.runAt,
                }))} 
              />
            </div>
          </div>

          <div className="grid gap-8 grid-cols-1 lg:grid-cols-4">
            <div className="lg:col-span-1">
              <ScorerBreakdown 
                breakdown={latestRun.scorerBreakdown as Record<string, { total: number; passed: number }>} 
              />
            </div>
            <div className="lg:col-span-3">
              <ScenarioMatrix 
                results={latestRun.scenarioResults as Record<string, { agent: string; output: string; scores: Record<string, any> }>} 
                onCellClick={handleCellClick}
              />
            </div>
          </div>

          <FailureInspector 
            isOpen={!!selectedCell}
            onClose={() => setSelectedCell(null)}
            data={getInspectorData()}
          />
        </>
      ) : (
        <div className="flex h-[400px] items-center justify-center rounded-lg border border-dashed border-cerebro-border bg-cerebro-surface/50 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2 text-center">
            <h3 className="text-xl font-bold text-foreground">No evaluation runs found</h3>
            <p className="max-w-sm text-muted-foreground">
              Run <code className="bg-muted px-1.5 py-0.5 rounded text-primary">npm run test:eval</code> to generate evaluation data.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

