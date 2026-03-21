"use client";

import { useEffect, useState } from "react";

type ShadowRow = {
  id: string;
  gateDecision: string;
  overallDelta: number;
  candidateVersionId: string | null;
};

type MutationRow = {
  id: string;
  agentId: string;
  status: string;
  createdAt: string;
  shadowRunResults: ShadowRow[];
  candidateVersion: { id: string; mutationReason: string | null } | null;
};

function statusBadgeClass(status: string, gate: string): string {
  if (status === "promoted" || gate === "promoted") {
    return "bg-emerald-600/20 text-emerald-300 border-emerald-500/40";
  }
  if (
    status === "rejected" ||
    gate.startsWith("rejected_") ||
    gate === "rejected_canary" ||
    gate === "rejected_regression" ||
    gate === "rejected_no_improvement"
  ) {
    return "bg-red-600/20 text-red-300 border-red-500/40";
  }
  return "bg-amber-600/20 text-amber-200 border-amber-500/40";
}

/**
 * Prompt mutation job history (shadow runs + gate outcomes).
 */
export function MutationHistory() {
  const [rows, setRows] = useState<MutationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetch("/api/testing/mutations")
      .then((r) => r.json())
      .then((body) => {
        if (!Array.isArray(body.data)) {
          setError("Invalid response");
          setRows([]);
          return;
        }
        setRows(body.data as MutationRow[]);
        setError(null);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : String(e));
        setRows([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const bestDelta = (shadows: ShadowRow[]) => {
    if (shadows.length === 0) return "—";
    const best = shadows.reduce((a, b) =>
      a.overallDelta >= b.overallDelta ? a : b
    );
    const pp = best.overallDelta * 100;
    return `${pp >= 0 ? "+" : ""}${pp.toFixed(1)} pp`;
  };

  const bestGate = (shadows: ShadowRow[]) => {
    if (shadows.length === 0) return "pending";
    const best = shadows.reduce((a, b) =>
      a.overallDelta >= b.overallDelta ? a : b
    );
    return best.gateDecision;
  };

  return (
    <div className="rounded-xl border border-cerebro-border/50 bg-cerebro-surface/30 p-6 backdrop-blur-md">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Mutation history</h2>
          <p className="text-sm text-muted-foreground">
            Self-correcting prompt runs (shadow evals + gate decisions).
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="rounded-lg border border-cerebro-border/60 bg-cerebro-surface/50 px-3 py-1.5 text-sm text-foreground hover:bg-cerebro-surface/80"
        >
          Refresh
        </button>
      </div>

      {loading && (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}
      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}

      {!loading && !error && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No mutation jobs yet. They appear when an eval run persists with failing
          scenarios and workers process the queue.
        </p>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-cerebro-border/40 text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Agent</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Created</th>
                <th className="py-2 pr-4 font-medium">Best overall Δ</th>
                <th className="py-2 pr-4 font-medium">Gate</th>
                <th className="py-2 font-medium">Mutation reason</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const gate = bestGate(r.shadowRunResults);
                const badge = statusBadgeClass(r.status, gate);
                return (
                  <tr
                    key={r.id}
                    className="border-b border-cerebro-border/20 text-foreground/90"
                  >
                    <td className="py-2 pr-4 font-mono text-xs">{r.agentId}</td>
                    <td className="py-2 pr-4">
                      <span
                        className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${badge}`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-xs text-muted-foreground">
                      {new Date(r.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs">
                      {bestDelta(r.shadowRunResults)}
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs">{gate}</td>
                    <td className="py-2 max-w-md truncate text-xs text-muted-foreground">
                      {r.candidateVersion?.mutationReason ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
