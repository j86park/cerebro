"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, FlaskConical, Play, Activity } from "lucide-react";
import { QueueStatusBadge } from "@/components/layout/QueueStatusBadge";
import { cn } from "@/lib/utils";

export function Sidebar({ className }: { className?: string }) {
  const pathname = usePathname();

  const navItems = [
    { name: "Operations", href: "/dashboard", icon: LayoutDashboard },
    { name: "Testing Suite", href: "/testing", icon: FlaskConical },
    { name: "Simulation", href: "/simulation", icon: Play },
  ];

  return (
    <div className={cn("bg-card border-r border-border flex flex-col h-full", className)}>
      <div className="p-6">
        <h1 className="text-xl font-bold tracking-tight text-primary flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Cerebro
        </h1>
        <p className="text-xs text-muted-foreground mt-1">Autonomous Vaults</p>
      </div>

      <nav className="flex-1 px-4 space-y-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md transition-all duration-200",
                isActive 
                  ? "bg-accent text-accent-foreground shadow-sm" 
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className={cn("h-4 w-4", isActive ? "text-accent-foreground" : "text-muted-foreground")} />
              <span className="text-sm font-medium">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border mt-auto">
        <QueueStatusBadge />
      </div>
    </div>
  );
}
