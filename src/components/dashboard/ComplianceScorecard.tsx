"use client";

import { useEffect, useState } from "react";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { UrgencyBadge } from "@/components/ui-extensions/UrgencyBadge";
import { StatusBadge } from "@/components/ui-extensions/StatusBadge";
import { Shield, AlertTriangle, FileText, CheckCircle2 } from "lucide-react";
import { ComplianceScorecard as ScorecardData } from "@/lib/compliance/scorecard";

type AuditTrailRow = {
  id: string;
  agentType: string;
  actionType: string;
  outcome: string | null;
  reasoning: string;
  performedAt: Date | string;
};

interface ScorecardProps {
  clientId: string;
}

export function ComplianceScorecard({ clientId }: ScorecardProps) {
  const [data, setData] = useState<{
    scorecard: ScorecardData;
    auditTrail: AuditTrailRow[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchScorecard() {
      try {
        const res = await fetch(`/api/vaults/${clientId}/scorecard`);
        const json = await res.json();
        setData(json);
      } catch (e) {
        console.error("Failed to fetch scorecard", e);
      } finally {
        setLoading(false);
      }
    }
    fetchScorecard();
  }, [clientId]);

  if (loading) return <div className="p-4 animate-pulse">Loading compliance data...</div>;
  if (!data) return <div className="p-4 text-red-500">Failed to load scorecard.</div>;

  const { scorecard, auditTrail } = data;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              Compliance Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{scorecard.summary.score}/100</div>
            <p className="text-xs text-muted-foreground mt-1">
              Based on {scorecard.summary.totalDocuments} total requirements
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Outstanding Issues
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <div>
                <div className="text-2xl font-bold text-red-500">{scorecard.summary.expiredCount}</div>
                <div className="text-[10px] uppercase font-bold text-muted-foreground">Expired</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-500">{scorecard.summary.missingCount}</div>
                <div className="text-[10px] uppercase font-bold text-muted-foreground">Missing</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-500" />
              Critical Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              {scorecard.summary.hasBlocker ? (
                <>
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                  <span className="font-bold text-red-500">Blocked</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  <span className="font-bold text-green-500">Operational</span>
                </>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              {scorecard.summary.hasBlocker ? "Identity verification required" : "No critical blockers found"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Decision Matrix & Rule Audit</CardTitle>
          <CardDescription>Detailed documents and requirements analysis</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Requirement</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Urgency</TableHead>
                <TableHead>Audit Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scorecard.documents.map((doc, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">
                    {doc.type.replace(/_/g, " ")}
                    {doc.isBlocker && <span className="ml-2 text-[10px] bg-red-100 text-red-600 px-1 rounded font-bold uppercase">Blocker</span>}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={doc.status} />
                  </TableCell>
                  <TableCell>
                    <UrgencyBadge level={doc.urgency} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-md">
                    {doc.regulatoryNote}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Agent Reasoning Trail</CardTitle>
          <CardDescription>Last 10 decisions made by Cerebro Agents</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {auditTrail.map((action) => (
              <div key={action.id} className="p-4 hover:bg-muted/30 transition-colors">
                <div className="flex justify-between items-start mb-1">
                  <div className="font-bold text-sm">
                    {action.agentType}: {action.actionType.replace(/_/g, " ")}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {new Date(action.performedAt).toLocaleString()}
                  </div>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    action.outcome === "ERROR" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
                  }`}>
                    {action.outcome}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                  {action.reasoning}
                </p>
              </div>
            ))}
            {auditTrail.length === 0 && (
              <div className="p-8 text-center text-muted-foreground text-sm italic">
                No agent history found for this client.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
