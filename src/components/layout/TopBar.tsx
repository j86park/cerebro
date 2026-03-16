import { env } from "@/lib/config";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

export function TopBar() {
  const demoDate = new Date(env.DEMO_DATE);
  
  return (
    <header className="h-16 border-b border-border bg-background flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center">
        <h2 className="text-sm font-medium">Vault Operations</h2>
      </div>
      
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>System Date:</span>
          <Badge variant="outline" className="font-mono">
            {format(demoDate, "MMM d, yyyy")}
          </Badge>
        </div>
      </div>
    </header>
  );
}
