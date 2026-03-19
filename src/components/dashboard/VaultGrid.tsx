"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { UrgencyBadge } from "@/components/ui-extensions/UrgencyBadge";
import { StatusBadge } from "@/components/ui-extensions/StatusBadge";
import { Play } from "lucide-react";

type VaultData = {
  id: string;
  name: string;
  accountType: string;
  onboardingStatus: string;
  advisorName: string;
  documentCount: number;
  urgency: {
    highest: string;
    expired: number;
    expiringSoon: number;
    missing: number;
  };
};

export function VaultGrid({ 
  vaults, 
  totalCount = 0, 
  pageSize = 50, 
  currentPage = 1 
}: { 
  vaults: VaultData[]; 
  totalCount?: number;
  pageSize?: number;
  currentPage?: number;
}) {
  const router = useRouter();
  const [triggering, setTriggering] = useState<string | null>(null);

  const totalPages = Math.ceil(totalCount / pageSize);
  const startRange = (currentPage - 1) * pageSize + 1;
  const endRange = Math.min(currentPage * pageSize, totalCount);

  const handleRowClick = (clientId: string) => {
    router.push(`/dashboard/vaults/${clientId}`);
  };

  const goToPage = (page: number) => {
    router.push(`/dashboard?page=${page}`);
  };

  const handleTrigger = async (e: React.MouseEvent, vault: VaultData) => {
    e.stopPropagation();
    setTriggering(vault.id);
    
    // Auto-select agent type loosely based on onboarding status
    const agentType = vault.onboardingStatus === "IN_PROGRESS" || vault.onboardingStatus === "NOT_STARTED" 
      ? "ONBOARDING" 
      : "COMPLIANCE";

    try {
      await fetch(`/api/agents/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: vault.id,
          agentType: agentType,
        }),
      });
    } catch (error) {
      console.error("Failed to trigger agent", error);
    } finally {
      setTimeout(() => setTriggering(null), 1000); // Visual feedback
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client Name</TableHead>
              <TableHead>Account Type</TableHead>
              <TableHead className="hidden md:table-cell">Advisor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Issues</TableHead>
              <TableHead>Urgency</TableHead>
              <TableHead className="text-right">Agent Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vaults.map((vault) => (
              <TableRow 
                key={vault.id} 
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => handleRowClick(vault.id)}
              >
                <TableCell className="font-medium">{vault.name}</TableCell>
                <TableCell>{vault.accountType}</TableCell>
                <TableCell className="hidden md:table-cell text-muted-foreground">{vault.advisorName}</TableCell>
                <TableCell>
                  <StatusBadge status={vault.onboardingStatus} />
                </TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    {vault.urgency.expired > 0 && <span className="text-xs text-red-500 font-medium">{vault.urgency.expired}x Critical</span>}
                    {vault.urgency.expiringSoon > 0 && <span className="text-xs text-amber-500 font-medium">{vault.urgency.expiringSoon}x Warning</span>}
                    {vault.urgency.missing > 0 && <span className="text-xs text-blue-500 font-medium">{vault.urgency.missing}x Missing</span>}
                    {vault.urgency.highest === "NONE" && <span className="text-xs text-green-500 font-medium">All Clear</span>}
                  </div>
                </TableCell>
                <TableCell>
                  <UrgencyBadge level={vault.urgency.highest} />
                </TableCell>
                <TableCell className="text-right">
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={(e) => handleTrigger(e, vault)}
                    disabled={triggering === vault.id}
                    className="bg-background"
                  >
                    <Play className={`h-3 w-3 mr-1 ${triggering === vault.id ? "animate-pulse text-primary" : ""}`} />
                    {triggering === vault.id ? "Triggered..." : "Run Agent"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {vaults.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No vaults found. Run the seed script to populate baseline data.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {totalCount > 0 && (
        <div className="flex items-center justify-between px-2 py-4 border-t border-border/40">
          <div className="text-sm text-muted-foreground">
            Showing <span className="font-medium text-foreground">{startRange}-{endRange}</span> of <span className="font-medium text-foreground">{totalCount.toLocaleString()}</span> clients
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              disabled={currentPage <= 1}
              onClick={() => goToPage(currentPage - 1)}
            >
              Previous
            </Button>
            <div className="text-sm font-medium px-2">
              Page {currentPage} of {totalPages}
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              disabled={currentPage >= totalPages}
              onClick={() => goToPage(currentPage + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
