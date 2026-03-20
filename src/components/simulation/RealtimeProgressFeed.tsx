"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { createClient } from "@/lib/supabase/client";
import { realtimeChannelSimulationRun } from "@/lib/realtime/constants";

export type ProgressLine = { id: string; message: string; at: string };

type RealtimeProgressFeedProps = {
  runId: string;
  initialLines?: ProgressLine[];
  /** Injected for tests — when set, used instead of Supabase. */
  subscribeToRun?: (
    runId: string,
    onPayload: (message: string) => void
  ) => () => void;
};

/**
 * Batch / progress lines for an active simulation run — subscription-driven (no polling).
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

    const supabase = createClient();
    const channelName = realtimeChannelSimulationRun(runId);
    const channel = supabase.channel(channelName);

    channel
      .on("broadcast", { event: "simulation_progress" }, (payload) => {
        const raw = payload.payload;
        const message =
          typeof raw === "object" && raw !== null && "message" in raw
            ? String((raw as { message: unknown }).message)
            : JSON.stringify(raw);
        const entry: ProgressLine = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          message,
          at: new Date().toISOString(),
        };
        setLines((prev) => [entry, ...prev].slice(0, 100));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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
