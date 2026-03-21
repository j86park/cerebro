import { Badge } from "@/components/ui/badge";
import { AlertCircle, AlertTriangle, Clock, ShieldCheck, HelpCircle } from "lucide-react";

type UrgencyLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "NONE";

export function UrgencyBadge({ level }: { level: string }) {
  const normLevel = level.toUpperCase() as UrgencyLevel;

  switch (normLevel) {
    case "CRITICAL":
      return (
        <Badge variant="destructive" className="flex w-fit items-center gap-1 bg-red-500/15 text-red-500 hover:bg-red-500/25 border-0">
          <AlertCircle className="h-3 w-3" />
          Critical
        </Badge>
      );
    case "HIGH":
      return (
        <Badge variant="outline" className="flex w-fit items-center gap-1 bg-orange-500/15 text-orange-500 hover:bg-orange-500/25 border-0">
          <AlertTriangle className="h-3 w-3" />
          High
        </Badge>
      );
    case "MEDIUM":
      return (
        <Badge variant="secondary" className="flex w-fit items-center gap-1 bg-yellow-500/15 text-yellow-500 hover:bg-yellow-500/25 border-0">
          <Clock className="h-3 w-3" />
          Medium
        </Badge>
      );
    case "LOW":
      return (
        <Badge variant="secondary" className="flex w-fit items-center gap-1 bg-blue-500/15 text-blue-500 hover:bg-blue-500/25 border-0">
          <HelpCircle className="h-3 w-3" />
          Low
        </Badge>
      );
    case "NONE":
      return (
        <Badge variant="outline" className="flex w-fit items-center gap-1 bg-green-500/15 text-green-500 border-green-500/20">
          <ShieldCheck className="h-3 w-3" />
          Secure
        </Badge>
      );
    default:
      return <Badge variant="outline">{level}</Badge>;
  }
}
