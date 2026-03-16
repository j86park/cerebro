import { Badge } from "@/components/ui/badge";

export function StatusBadge({ status }: { status: string }) {
  const s = status.toUpperCase();
  
  if (s === "VALID" || s === "COMPLETED") {
    return <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">{status.replace(/_/g, " ")}</Badge>;
  }
  if (s === "EXPIRED" || s === "STALLED") {
    return <Badge variant="destructive" className="bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/20">{status.replace(/_/g, " ")}</Badge>;
  }
  if (s === "EXPIRING_SOON" || s === "MISSING") {
    return <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20">{status.replace(/_/g, " ")}</Badge>;
  }
  
  // Default for PENDING_REVIEW, IN_PROGRESS, NOT_STARTED, REQUESTED
  return <Badge variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/20">{status.replace(/_/g, " ")}</Badge>;
}
