"use client";

import { useCallback, useEffect, useState } from "react";

type PendingCandidate = {
  candidateId?: string;
  approvalStatus?: string;
  notes?: string;
  draftScenario?: {
    clientId?: string;
    agentType?: string;
    canary?: boolean;
  };
  source?: { clientId?: string; minedAt?: string };
  error?: string;
};

type ApprovedSummary = {
  scenarioId: string;
  version: number;
  clientId: string;
  approvedBy: string;
  approvedAt: string;
};

/**
 * Testing Suite UX for dual-stream online → human approve → golden (cheap-eval PR5).
 * REGULATORY: approve requires explicit regulatory confirmation; never auto-promotes.
 */
export function GoldenPromotePanel() {
  const [candidates, setCandidates] = useState<PendingCandidate[]>([]);
  const [approved, setApproved] = useState<ApprovedSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [approvedBy, setApprovedBy] = useState("testing-suite-operator");
  const [regulatoryConfirmed, setRegulatoryConfirmed] = useState(false);
  const [bridgeFixture, setBridgeFixture] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/testing/goldens");
      const body = (await res.json()) as {
        data?: {
          candidates: PendingCandidate[];
          approvedGoldens: ApprovedSummary[];
        };
        error?: string;
      };
      if (!res.ok) {
        setError(body.error ?? "Failed to load goldens");
        setCandidates([]);
        setApproved([]);
        return;
      }
      setCandidates(body.data?.candidates ?? []);
      setApproved(body.data?.approvedGoldens ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setCandidates([]);
      setApproved([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const approve = async (candidateId: string) => {
    if (!regulatoryConfirmed) {
      setStatus(
        "REGULATORY: confirm expectations are correct before approve",
      );
      return;
    }
    setBusyId(candidateId);
    setStatus(null);
    try {
      const res = await fetch("/api/testing/goldens/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve",
          candidateId,
          approvedBy,
          regulatoryConfirmed: true,
          bridgeFixture,
        }),
      });
      const body = (await res.json()) as {
        data?: {
          dryRun?: boolean;
          written?: boolean;
          fileName?: string;
          canaryHardGateEligible?: boolean;
          note?: string;
          fixtureBridge?: { fixtureId?: string; written?: boolean };
        };
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        setStatus(body.message ?? body.error ?? "Approve failed");
        return;
      }
      const fixtureNote = body.data?.fixtureBridge?.fixtureId
        ? ` · fixture ${body.data.fixtureBridge.fixtureId}${
            body.data.fixtureBridge.written ? " written" : " (dry-run)"
          }`
        : "";
      setStatus(
        `${body.data?.note ?? "OK"}${
          body.data?.fileName ? ` · ${body.data.fileName}` : ""
        }${fixtureNote}`,
      );
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (candidateId: string) => {
    setBusyId(candidateId);
    setStatus(null);
    try {
      const res = await fetch("/api/testing/goldens/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reject",
          candidateId,
          rejectedBy: approvedBy,
          reason: "rejected from Testing Suite promote panel",
        }),
      });
      const body = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
        setStatus(body.message ?? body.error ?? "Reject failed");
        return;
      }
      setStatus(`Rejected ${candidateId}`);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const pending = candidates.filter(
    (c) => c.candidateId && !c.error && c.approvalStatus === "pending",
  );

  return (
    <div className="rounded-xl border border-cerebro-border/50 bg-cerebro-surface/30 p-6 backdrop-blur-md">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">
            Failure → golden promote
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Dual-stream online samples (uniform drift ≤5% + failure-weighted)
            stage pending candidates. Human approve is required before ship-gate
            / canary membership. Online sampling is never the primary ship gate.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-cerebro-border/60 bg-cerebro-surface/50 px-3 py-1.5 text-sm text-foreground hover:bg-cerebro-surface/80"
        >
          Refresh
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2 text-muted-foreground">
          <span>Approved by</span>
          <input
            value={approvedBy}
            onChange={(e) => setApprovedBy(e.target.value)}
            className="rounded-md border border-cerebro-border/60 bg-cerebro-surface/60 px-2 py-1 text-foreground"
          />
        </label>
        <label className="flex items-center gap-2 text-muted-foreground">
          <input
            type="checkbox"
            checked={regulatoryConfirmed}
            onChange={(e) => setRegulatoryConfirmed(e.target.checked)}
          />
          <span>REGULATORY expectations confirmed</span>
        </label>
        <label className="flex items-center gap-2 text-muted-foreground">
          <input
            type="checkbox"
            checked={bridgeFixture}
            onChange={(e) => setBridgeFixture(e.target.checked)}
          />
          <span>Bridge to $0 trajectory fixture on write</span>
        </label>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}
      {status && (
        <p className="mb-3 text-sm text-emerald-300/90">{status}</p>
      )}

      {!loading && !error && pending.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No pending candidates. Failure-weighted online samples and{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
            npm run golden:export
          </code>{" "}
          appear here for human review.
        </p>
      )}

      {pending.length > 0 && (
        <div className="mb-6 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-cerebro-border/40 text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Candidate</th>
                <th className="py-2 pr-4 font-medium">Client</th>
                <th className="py-2 pr-4 font-medium">Agent</th>
                <th className="py-2 pr-4 font-medium">Canary draft</th>
                <th className="py-2 pr-4 font-medium">Notes</th>
                <th className="py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((c) => {
                const id = c.candidateId!;
                return (
                  <tr
                    key={id}
                    className="border-b border-cerebro-border/20 text-foreground/90"
                  >
                    <td className="py-2 pr-4 font-mono text-xs">{id}</td>
                    <td className="py-2 pr-4 font-mono text-xs">
                      {c.draftScenario?.clientId ?? c.source?.clientId ?? "—"}
                    </td>
                    <td className="py-2 pr-4 text-xs">
                      {c.draftScenario?.agentType ?? "—"}
                    </td>
                    <td className="py-2 pr-4 text-xs">
                      {c.draftScenario?.canary === true ? "yes" : "no"}
                    </td>
                    <td className="max-w-md truncate py-2 pr-4 text-xs text-muted-foreground">
                      {c.notes ?? "—"}
                    </td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busyId === id || !regulatoryConfirmed}
                          onClick={() => void approve(id)}
                          className="rounded-md border border-emerald-500/40 bg-emerald-600/20 px-2 py-1 text-xs text-emerald-200 hover:bg-emerald-600/30 disabled:opacity-40"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={busyId === id}
                          onClick={() => void reject(id)}
                          className="rounded-md border border-red-500/40 bg-red-600/20 px-2 py-1 text-xs text-red-200 hover:bg-red-600/30 disabled:opacity-40"
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div>
        <h3 className="mb-2 text-sm font-semibold text-white">
          Approved ship-gate goldens ({approved.length})
        </h3>
        {approved.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            None yet. After approve (non-DRY_RUN), files land in{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
              scenarios/goldens/approved/
            </code>{" "}
            and canary=true ids join the hard-gate set.
          </p>
        ) : (
          <ul className="space-y-1 text-xs text-muted-foreground">
            {approved.map((g) => (
              <li key={`${g.scenarioId}-v${g.version}`} className="font-mono">
                {g.scenarioId}.v{g.version} · {g.clientId} · {g.approvedBy} ·{" "}
                {g.approvedAt}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
