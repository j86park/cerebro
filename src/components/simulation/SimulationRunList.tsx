"use client";

import { useEffect, useState } from "react";
import { SimulationRunCard } from "./SimulationRunCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info } from "lucide-react";

export function SimulationRunList() {
  const [runs, setRuns] = useState<
    Array<{
      id: string;
      status: string;
      clientCount: number;
      simulatedDays: number;
      batchesCompleted: number;
      batchesTotal: number;
      metrics?: unknown;
      startedAt: string;
      completedAt?: string | null;
    }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchRuns() {
      try {
        const res = await fetch("/api/simulation/runs");
        if (!res.ok) throw new Error("Failed to fetch simulation runs");
        const data = await res.json();
        const list = data.data?.runs ?? data.runs ?? [];
        setRuns(list);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Possible API error");
      } finally {
        setLoading(false);
      }
    }

    fetchRuns();
    const interval = setInterval(fetchRuns, 10000); // Poll every 10s
    return () => clearInterval(interval);
  }, []);

  if (loading && runs.length === 0) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-48 w-full bg-slate-900/50" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="bg-red-500/10 border-red-500/20 text-red-500">
        <Info className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="text-center py-20 border-2 border-dashed border-slate-800 rounded-2xl">
        <p className="text-slate-500">No simulation history found.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {runs.map((run) => (
        <SimulationRunCard key={run.id} run={run} />
      ))}
    </div>
  );
}
