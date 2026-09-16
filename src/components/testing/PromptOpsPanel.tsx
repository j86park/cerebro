"use client";

import { useCallback, useEffect, useState } from "react";

type PointerRow = {
  environment: "STAGING" | "PRODUCTION";
  promptVersionId: string;
  previousPromptVersionId: string | null;
  contentPreview: string;
  mutationReason: string | null;
  createdAt: string;
};

/**
 * Minimal ops hook: view staging/prod pointers and human-gated promote/rollback.
 */
export function PromptOpsPanel() {
  const [agentId, setAgentId] = useState<"compliance" | "onboarding">(
    "compliance",
  );
  const [pointers, setPointers] = useState<PointerRow[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/prompts/pointers?agentId=${agentId}`);
    const body = (await res.json()) as {
      data?: { pointers: PointerRow[] };
      error?: string;
    };
    if (!res.ok) {
      setStatus(body.error ?? "Failed to load pointers");
      return;
    }
    setPointers(body.data?.pointers ?? []);
    setStatus(null);
  }, [agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const promote = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/prompts/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, confirmHumanPromote: true }),
      });
      const body = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
        setStatus(body.message ?? body.error ?? "Promote failed");
        return;
      }
      setStatus("Promoted staging → production");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const rollback = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/prompts/rollback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, confirmHumanRollback: true }),
      });
      const body = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
        setStatus(body.message ?? body.error ?? "Rollback failed");
        return;
      }
      setStatus("Rolled back production pointer");
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-cerebro-border/50 bg-cerebro-surface/30 p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Prompt ops</h2>
          <p className="text-sm text-muted-foreground">
            Staging/production pointers with human-gated promote and rollback.
          </p>
        </div>
        <select
          className="rounded-md border border-cerebro-border bg-background px-3 py-1.5 text-sm"
          value={agentId}
          onChange={(e) =>
            setAgentId(e.target.value as "compliance" | "onboarding")
          }
        >
          <option value="compliance">compliance</option>
          <option value="onboarding">onboarding</option>
        </select>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {pointers.map((p) => (
          <div
            key={p.environment}
            className="rounded-lg border border-cerebro-border/40 bg-black/20 p-3 text-sm"
          >
            <div className="font-medium text-white">{p.environment}</div>
            <div className="mt-1 font-mono text-xs text-muted-foreground break-all">
              {p.promptVersionId}
            </div>
            {p.previousPromptVersionId ? (
              <div className="mt-1 text-xs text-muted-foreground">
                previous: {p.previousPromptVersionId}
              </div>
            ) : null}
            <p className="mt-2 line-clamp-3 text-muted-foreground">
              {p.contentPreview}
            </p>
          </div>
        ))}
        {pointers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No pointers yet — run <code>npm run seed:prompts</code>.
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void promote()}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          Promote staging → production
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void rollback()}
          className="rounded-md border border-cerebro-border px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          Rollback production
        </button>
      </div>
      {status ? (
        <p className="text-sm text-muted-foreground" role="status">
          {status}
        </p>
      ) : null}
    </section>
  );
}
