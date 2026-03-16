import Link from "next/link";
import { LayoutDashboard, Users, Activity, Settings } from "lucide-react";
import { QueueStatusBadge } from "@/components/layout/QueueStatusBadge";

export function Sidebar({ className }: { className?: string }) {
  return (
    <div className={`bg-card border-r border-border flex flex-col ${className}`}>
      <div className="p-6">
        <h1 className="text-xl font-bold tracking-tight text-primary flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Cerebro
        </h1>
        <p className="text-xs text-muted-foreground mt-1">Autonomous Vaults</p>
      </div>

      <nav className="flex-1 px-4 space-y-2">
        <Link
          href="/dashboard"
          className="flex items-center gap-3 px-3 py-2 rounded-md bg-accent text-accent-foreground transition-colors"
        >
          <LayoutDashboard className="h-4 w-4" />
          <span className="text-sm font-medium">Operations</span>
        </Link>
        
        <Link
          href="/testing"
          className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <Users className="h-4 w-4" />
          <span className="text-sm font-medium">Testing Suite</span>
        </Link>

        <Link
          href="/simulation"
          className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <Settings className="h-4 w-4" />
          <span className="text-sm font-medium">Simulation</span>
        </Link>
      </nav>

      <div className="p-4 border-t border-border mt-auto h-32">
        <QueueStatusBadge />
      </div>
    </div>
  );
}
