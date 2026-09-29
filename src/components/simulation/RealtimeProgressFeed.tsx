"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

export type ProgressLine = { id: string; message: string; at: string };

type RealtimeProgressFeedProps = {
  runId: string;
  initialLines?: ProgressLine[];
  /** Injected for tests — when set, used instead of the local run-status API. */
  subscribeToRun?: (
    runId: string,
    onPayload: (message: string) => void
  ) => () => void;
};

/**
 * Batch / progress lines from the local PostgreSQL-backed run-status API.
 */
export function RealtimeProgressFeed({
  runId,
  initialLines = [],
  subscribeToRun,
}: RealtimeProgressFeedProps) {
  const [lines, setLines] = useState<ProgressLine[]>(initialLines);

  useEffect(() => {
    setLines(initialLines);
  }, [initialLines, runId]);

  useEffect(() => {
    if (!runId) return;

    if (subscribeToRun) {
      return subscribeToRun(runId, (message) => {
        const entry: ProgressLine = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          message,
          at: new Date().toISOString(),
        };
        setLines((prev) => [entry, ...prev].slice(0, 100));
      });
    }

    let active = true;
    let lastKey = "";
    const refresh = async () => {
      try {
        const response = await fetch(`/api/simulation/${encodeURIComponent(runId)}`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = await response.json();
        const run = body.data as {
          status: string;
          batchesCompleted: number;
          batchesTotal: number;
        };
        if (!active || !run) return;
        const key = `${run.status}:${run.batchesCompleted}:${run.batchesTotal}`;
        if (key === lastKey) return;
        lastKey = key;
        const entry: ProgressLine = {
          id: `${Date.now()}-${key}`,
          message: `${run.status}: ${run.batchesCompleted}/${run.batchesTotal} batches completed`,
          at: new Date().toISOString(),
        };
        setLines((prev) => [entry, ...prev].slice(0, 100));
      } catch (error) {
        console.error("[simulation] Failed to refresh progress:", error);
      }
    };
    void refresh();
    const interval = setInterval(() => void refresh(), 3_000);
    return () => { active = false; clearInterval(interval); };
  }, [runId, subscribeToRun]);

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="text-slate-200 text-base">Realtime progress</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[220px] pr-3">
          <ul className="space-y-2 text-sm text-slate-300">
            {lines.length === 0 ? (
              <li className="text-slate-500">Waiting for simulation events…</li>
            ) : (
              lines.map((l) => (
                <li key={l.id} className="border-b border-slate-800/80 pb-2">
                  <span className="text-[10px] text-slate-500 block">{l.at}</span>
                  {l.message}
                </li>
              ))
            )}
          </ul>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
