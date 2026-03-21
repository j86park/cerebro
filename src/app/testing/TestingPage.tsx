"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import type { EvalRun } from "@prisma/client";
import { EvalOverview } from "@/components/testing/EvalOverview";
import { RegressionTracker } from "@/components/testing/RegressionTracker";
import { ScorerBreakdown } from "@/components/testing/ScorerBreakdown";
import { ScenarioMatrix } from "@/components/testing/ScenarioMatrix";
import { MutationHistory } from "@/components/testing/MutationHistory";
import { FailureInspector } from "@/components/testing/FailureInspector";
import { GROUND_TRUTH } from "@/evals/ground-truth";

type ScenarioScores = Record<string, { score?: number; reason?: string }>;

type ScenarioBlock = {
  agent: string;
  output?: string;
  error?: string;
  scores: ScenarioScores;
};

export type SerializableEvalRun = Omit<
  EvalRun,
  "scenarioResults" | "scorerBreakdown"
> & {
  scenarioResults: Record<string, ScenarioBlock>;
  scorerBreakdown: Record<string, { total: number; passed: number }>;
};

export default function TestingPage({
  runsInitial,
}: {
  runsInitial: SerializableEvalRun[];
}) {
  const [runs, setRuns] = useState<SerializableEvalRun[]>(runsInitial);
  const [running, setRunning] = useState(false);
  const [selectedCell, setSelectedCell] = useState<{
    clientId: string;
    scorerId: string;
  } | null>(null);
  const [mutationHistoryKey, setMutationHistoryKey] = useState(0);

  const latestRun = runs[0];

  const handleRunEval = async () => {
    setRunning(true);
    try {
      const res = await fetch("/api/testing/run", { method: "POST" });
      if (!res.ok) throw new Error("Failed to run evaluations");

      const fresh = await fetch("/api/testing/runs").then((r) => r.json());
      const list: SerializableEvalRun[] = Array.isArray(fresh.data)
        ? fresh.data
        : [];
      setRuns(list);
    } catch (err) {
      console.error(err);
      alert(
        "Error running evaluation: " +
          (err instanceof Error ? err.message : String(err))
      );
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
    const scenarioResult = latestRun.scenarioResults[clientId];
    const scoreData = scenarioResult?.scores[scorerId];
    const groundTruth = GROUND_TRUTH.find((g) => g.clientId === clientId);

    if (!scenarioResult || !scoreData) return null;

    return {
      clientId,
      agent: scenarioResult.agent,
      scorerId,
      score: scoreData.score ?? 0,
      reason: scoreData.reason ?? "",
      output: scenarioResult.output ?? "",
      expected: groundTruth?.expected,
    };
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center bg-cerebro-surface/30 p-6 rounded-xl border border-cerebro-border/50 backdrop-blur-md">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Testing Suite
          </h1>
          <p className="text-muted-foreground mt-1">
            Stress test agent reasoning against human-verified ground truth.
          </p>
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
          )}
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
                runs={runs.map((r) => ({
                  id: r.id,
                  overallScore: r.overallScore,
                  runAt: r.runAt,
                }))}
              />
            </div>
          </div>

          <div className="grid gap-8 grid-cols-1 lg:grid-cols-4">
            <div className="lg:col-span-1">
              <ScorerBreakdown breakdown={latestRun.scorerBreakdown} />
            </div>
            <div className="lg:col-span-3">
              <ScenarioMatrix
                results={latestRun.scenarioResults}
                onCellClick={handleCellClick}
              />
            </div>
          </div>

          <MutationHistory key={mutationHistoryKey} />

          <FailureInspector
            isOpen={!!selectedCell}
            onClose={() => setSelectedCell(null)}
            data={getInspectorData()}
          />
        </>
      ) : (
        <div className="flex h-[400px] items-center justify-center rounded-lg border border-dashed border-cerebro-border bg-cerebro-surface/50 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2 text-center">
            <h3 className="text-xl font-bold text-foreground">
              No evaluation runs found
            </h3>
            <p className="max-w-sm text-muted-foreground">
              Run <code className="bg-muted px-1.5 py-0.5 rounded text-primary">npm run eval</code>{" "}
              or use the button above to generate evaluation data.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
