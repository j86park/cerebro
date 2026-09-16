"use client";

import type { CitationDisplayRow } from "@/lib/documents/citations";

export type CitedFieldsPanelProps = {
  rows: CitationDisplayRow[];
  /** Optional heading; omit when embedding under another title. */
  title?: string;
  emptyLabel?: string;
  className?: string;
};

/**
 * Compact citation list for extracted / ledger fields (Reg BI / exam readiness).
 * Presentational only — no mutations.
 */
export function CitedFieldsPanel({
  rows,
  title = "Cited fields",
  emptyLabel,
  className,
}: CitedFieldsPanelProps) {
  if (rows.length === 0) {
    if (!emptyLabel) return null;
    return (
      <p className={`text-[11px] text-muted-foreground ${className ?? ""}`}>
        {emptyLabel}
      </p>
    );
  }

  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      {title ? (
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
          {title}
        </p>
      ) : null}
      <ul className="space-y-1.5">
        {rows.map((row) => (
          <li key={row.key} className="text-[11px] leading-snug">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="font-medium text-foreground">{row.label}</span>
              <span className="text-foreground/90">{row.value}</span>
              {row.confidence != null ? (
                <span className="text-muted-foreground font-mono">
                  {(row.confidence * 100).toFixed(0)}%
                </span>
              ) : null}
            </div>
            {(row.excerpt || row.page != null || row.startOffset != null) && (
              <p className="text-muted-foreground mt-0.5 ml-0.5 border-l-2 border-border/80 pl-2">
                {row.excerpt ? (
                  <span className="italic">&ldquo;{row.excerpt}&rdquo;</span>
                ) : null}
                {row.page != null ? (
                  <span className="ml-1 font-mono">p.{row.page}</span>
                ) : null}
                {row.startOffset != null && row.endOffset != null ? (
                  <span className="ml-1 font-mono">
                    @{row.startOffset}–{row.endOffset}
                  </span>
                ) : null}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
