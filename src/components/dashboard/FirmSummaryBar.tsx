import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldAlert, ShieldCheck, Users, AlertTriangle } from "lucide-react";

type FirmSummaryProps = {
  totalClients: number;
  criticalClients: number;
  issueClients: number;
  secureClients: number;
};

export function FirmSummaryBar({ totalClients, criticalClients, issueClients, secureClients }: FirmSummaryProps) {
  const complianceScore = totalClients > 0 ? Math.round((secureClients / totalClients) * 100) : 100;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Clients</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{totalClients}</div>
          <p className="text-xs text-muted-foreground mt-1">Managed vaults</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Critical Issues</CardTitle>
          <ShieldAlert className="h-4 w-4 text-red-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-red-500">{criticalClients}</div>
          <p className="text-xs text-muted-foreground mt-1">Requires immediate action</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Any Issues</CardTitle>
          <AlertTriangle className="h-4 w-4 text-amber-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-amber-500">{issueClients}</div>
          <p className="text-xs text-muted-foreground mt-1">Vaults with warnings</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Compliance Health</CardTitle>
          <ShieldCheck className="h-4 w-4 text-green-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-500">{complianceScore}%</div>
          <p className="text-xs text-muted-foreground mt-1">{secureClients} vaults secure</p>
        </CardContent>
      </Card>
    </div>
  );
}
