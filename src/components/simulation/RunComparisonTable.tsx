"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type RunComparisonRow = {
  id: string;
  startedAt: string;
  status: string;
  clientCount: number;
  simulatedDays: number;
  totalActions?: number;
};

type RunComparisonTableProps = {
  runs: RunComparisonRow[];
};

export function RunComparisonTable({ runs }: RunComparisonTableProps) {
  if (runs.length === 0) {
    return (
      <p className="text-sm text-slate-500 py-6 text-center border border-dashed border-slate-700 rounded-lg">
        No runs to compare yet.
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
      <h3 className="text-sm font-semibold text-slate-200 p-4 border-b border-slate-800">
        Recent runs
      </h3>
      <Table>
        <TableHeader>
          <TableRow className="border-slate-800 hover:bg-transparent">
            <TableHead className="text-slate-400">Run</TableHead>
            <TableHead className="text-slate-400">Status</TableHead>
            <TableHead className="text-slate-400">Clients</TableHead>
            <TableHead className="text-slate-400">Days</TableHead>
            <TableHead className="text-slate-400 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.map((r) => (
            <TableRow key={r.id} className="border-slate-800">
              <TableCell className="font-mono text-xs text-slate-300">
                …{r.id.slice(-8)}
              </TableCell>
              <TableCell className="text-slate-300">{r.status}</TableCell>
              <TableCell className="text-slate-300">
                {r.clientCount.toLocaleString()}
              </TableCell>
              <TableCell className="text-slate-300">{r.simulatedDays}</TableCell>
              <TableCell className="text-right text-slate-300">
                {(r.totalActions ?? 0).toLocaleString()}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
