"use client";

import { useState } from "react";
import { Play, Loader2 } from "lucide-react";
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
  const [runs, setRuns] = useState(runsInitial);
  const [running, setRunning] = useState(false);
  const [selectedCell, setSelectedCell] = useState<{
    clientId: string;
    scorerId: string;
  } | null>(null);

  const latestRun = runs[0];

  const handleRunEval = async () => {
    setRunning(true);
    try {
      const res = await fetch("/api/testing/run", { method: "POST" });
      if (!res.ok) throw new Error("Failed to run evaluations");
      
      // Refresh list
      const fresh = await fetch("/api/testing/runs").then(r => r.json());
      setRuns(fresh);
    } catch (err) {
      console.error(err);
      alert("Error running evaluation: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setRunning(false);
    }
  };

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
      <div className="flex justify-between items-center bg-cerebro-surface/30 p-6 rounded-xl border border-cerebro-border/50 backdrop-blur-md">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Testing Suite</h1>
          <p className="text-muted-foreground mt-1">Stress test agent reasoning against human-verified ground truth.</p>
        </div>
        <button
          onClick={handleRunEval}
          disabled={running}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:opacity-50 text-white font-semibold rounded-lg shadow-lg shadow-blue-500/20 transition-all active:scale-95"
        >
          {running ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Running Scenarios...
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-current" />
              Run Evaluation Suite
            </>
          )
          }
        </button>
      </div>

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

