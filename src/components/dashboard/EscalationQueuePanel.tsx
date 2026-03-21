import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertOctagon } from "lucide-react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

export type EscalationListItem = {
  id: string;
  clientId: string;
  client: { name: string };
  reasoning: string;
  stage: string;
  performedAt: string;
};

export function EscalationQueuePanel({
  escalations,
}: {
  escalations: EscalationListItem[];
}) {
  return (
    <Card className="h-[500px] flex flex-col">
      <CardHeader className="border-b pb-4 shrink-0 bg-red-50/50">
        <CardTitle className="flex items-center gap-2 text-lg text-red-700">
          <AlertOctagon className="h-5 w-5" />
          Active Escalations
          <Badge variant="destructive" className="ml-2">{escalations.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 p-0 overflow-auto">
        {escalations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8 text-center space-y-2">
            <div className="h-12 w-12 rounded-full border border-dashed flex items-center justify-center bg-muted/50">
              <span className="text-xl">🎉</span>
            </div>
            <p className="text-sm font-medium text-foreground">Zero active escalations</p>
            <p className="text-xs">Agents are handling all pending issues successfully.</p>
          </div>
        ) : (
          <div className="p-0 divide-y divide-border">
            {escalations.map((item) => (
              <div key={item.id} className="p-4 hover:bg-muted/50 transition-colors flex items-center justify-between group">
                <div>
                  <Link href={`/dashboard/vaults/${item.clientId}`} className="text-sm font-medium hover:underline">
                    {item.client.name}
                  </Link>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{item.reasoning}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0 ml-4">
                  <Badge variant="destructive" className="text-[10px]">{item.stage}</Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {formatDistanceToNow(new Date(item.performedAt))} ago
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
