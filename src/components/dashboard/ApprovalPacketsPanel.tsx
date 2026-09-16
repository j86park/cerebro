"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ClipboardCheck, AlertCircle, Check, X } from "lucide-react";
import type { ApprovalPacket } from "@/lib/ops/schemas";
import type { SlaMetrics } from "@/lib/ops/schemas";
import {
  citationRowsFromCitedFields,
  citationRowsFromExtract,
  parseExtractedFieldsJson,
} from "@/lib/documents/citations";
import { CitedFieldsPanel } from "@/components/vault/CitedFieldsPanel";

export type ApprovalPacketsPanelProps = {
  packets: ApprovalPacket[];
  metrics: SlaMetrics | null;
};

/**
 * Ops panel: pending HITL approval packets with ledger/vault evidence and
 * approve/deny actions that POST to the existing `/api/approvals/decide` HITL API.
 */
export function ApprovalPacketsPanel({
  packets,
  metrics,
}: ApprovalPacketsPanelProps) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [resolved, setResolved] = useState<Set<string>>(new Set());

  const visible = packets.filter((p) => !resolved.has(p.packetId));

  const decide = async (
    packet: ApprovalPacket,
    decision: "approve" | "deny",
  ) => {
    setBusyKey(packet.packetId);
    setStatusMsg(null);
    try {
      const res = await fetch(packet.decideEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: packet.clientId,
          openKey: packet.openKey,
          decision,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? `Decide failed (${res.status})`);
      }
      setResolved((prev) => new Set(prev).add(packet.packetId));
      setStatusMsg({
        type: "success",
        text: `${decision === "approve" ? "Approved" : "Denied"} ${packet.clientName} (${packet.openKey}).`,
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to submit decision.";
      setStatusMsg({ type: "error", text: message });
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <Card className="h-[500px] flex flex-col">
      <CardHeader className="border-b pb-4 shrink-0 bg-amber-50/40">
        <CardTitle className="flex items-center gap-2 text-lg">
          <ClipboardCheck className="h-5 w-5 text-amber-700" />
          Approval packets
          <Badge variant="secondary" className="ml-2">
            {visible.length}
          </Badge>
        </CardTitle>
        {metrics && (
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span>
              escalation_rate{" "}
              <strong className="text-foreground">
                {(metrics.escalation_rate * 100).toFixed(1)}%
              </strong>
            </span>
            <span>
              timeout_rate{" "}
              <strong className="text-foreground">
                {(metrics.timeout_rate * 100).toFixed(1)}%
              </strong>
            </span>
            <span>
              pending{" "}
              <strong className="text-foreground">
                {metrics.pendingApprovals}
              </strong>
            </span>
          </div>
        )}
      </CardHeader>
      <CardContent className="flex-1 p-0 overflow-auto">
        {statusMsg && (
          <div className="p-3 border-b">
            <Alert
              variant={statusMsg.type === "error" ? "destructive" : "default"}
              className={
                statusMsg.type === "success"
                  ? "border-green-200 bg-green-50 text-green-900"
                  : ""
              }
            >
              {statusMsg.type === "error" && (
                <AlertCircle className="h-4 w-4" />
              )}
              <AlertDescription>{statusMsg.text}</AlertDescription>
            </Alert>
          </div>
        )}
        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8 text-center space-y-2">
            <p className="text-sm font-medium text-foreground">
              No pending approval packets
            </p>
            <p className="text-xs">
              HITL escalations awaiting advisor decide will appear here.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {visible.map((packet) => {
              const docExtractRows = citationRowsFromExtract(
                parseExtractedFieldsJson(
                  packet.citedDocument?.extractedFields ?? null,
                ),
              );
              const ledgerCiteRows = citationRowsFromCitedFields(
                packet.ledgerEvidence[0]?.citedFields ?? null,
              );

              return (
                <div key={packet.packetId} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/dashboard/vaults/${packet.clientId}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {packet.clientName}
                      </Link>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {packet.hitl?.reasoning ??
                          (packet.reasonCodes.length > 0
                            ? packet.reasonCodes.join(", ")
                            : "Pending approval")}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Badge className="text-[10px]">{packet.status}</Badge>
                      <span className="text-[10px] text-muted-foreground">
                        stage {packet.ladderStage}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {packet.reasonCodes.map((code) => (
                      <Badge
                        key={code}
                        variant="outline"
                        className="text-[10px] font-normal"
                      >
                        {code}
                      </Badge>
                    ))}
                    {packet.hitl?.toolName && (
                      <Badge
                        variant="outline"
                        className="text-[10px] font-normal"
                      >
                        {packet.hitl.toolName}
                      </Badge>
                    )}
                    {packet.policyVersion && (
                      <Badge
                        variant="outline"
                        className="text-[10px] font-normal"
                      >
                        {packet.policyVersion}
                      </Badge>
                    )}
                  </div>

                  {packet.citedDocument && (
                    <p className="text-[11px] text-muted-foreground">
                      Doc {packet.citedDocument.type}:{" "}
                      <span className="text-foreground">
                        {packet.citedDocument.status}
                      </span>
                    </p>
                  )}

                  {docExtractRows.length > 0 && (
                    <CitedFieldsPanel
                      rows={docExtractRows}
                      title="Document citations"
                    />
                  )}

                  {packet.ledgerEvidence[0] && (
                    <p className="text-[11px] text-muted-foreground line-clamp-2">
                      Ledger: {packet.ledgerEvidence[0].actionType}
                      {packet.ledgerEvidence[0].outcome
                        ? ` → ${packet.ledgerEvidence[0].outcome}`
                        : ""}
                      {packet.ledgerEvidence[0].reasonCodes.length > 0
                        ? ` [${packet.ledgerEvidence[0].reasonCodes.join(", ")}]`
                        : ""}
                    </p>
                  )}

                  {ledgerCiteRows.length > 0 && (
                    <CitedFieldsPanel
                      rows={ledgerCiteRows}
                      title="Ledger cited fields"
                    />
                  )}

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={busyKey === packet.packetId}
                      onClick={() => void decide(packet, "approve")}
                    >
                      <Check className="h-3.5 w-3.5" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busyKey === packet.packetId}
                      onClick={() => void decide(packet, "deny")}
                    >
                      <X className="h-3.5 w-3.5" />
                      Deny
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
