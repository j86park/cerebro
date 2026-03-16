"use client";

import { useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
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
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar className="w-64" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar title="Testing Suite" />
        <main className="flex-1 overflow-y-auto p-6 space-y-8">
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
              <div className="grid gap-8 grid-cols-4">
                <RegressionTracker 
                  runs={runs.map((r: any) => ({
                    id: r.id,
                    overallScore: r.overallScore,
                    runAt: r.runAt,
                  }))} 
                />
              </div>

              <div className="grid gap-8 grid-cols-4">
                <ScorerBreakdown 
                  breakdown={latestRun.scorerBreakdown as Record<string, { total: number; passed: number }>} 
                />
                <ScenarioMatrix 
                  results={latestRun.scenarioResults as Record<string, { agent: string; output: string; scores: Record<string, any> }>} 
                  onCellClick={handleCellClick}
                />
              </div>

              <FailureInspector 
                isOpen={!!selectedCell}
                onClose={() => setSelectedCell(null)}
                data={getInspectorData()}
              />
            </>
          ) : (
            <div className="flex h-[400px] items-center justify-center rounded-lg border border-dashed">
              <div className="flex flex-col items-center gap-2 text-center">
                <h3 className="text-lg font-semibold">No evaluation runs found</h3>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Run npm run test:eval to generate evaluation data.
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
