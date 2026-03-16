import { FirmSummaryBar } from "@/components/dashboard/FirmSummaryBar";
import { VaultGrid } from "@/components/dashboard/VaultGrid";
import { prisma } from "@/lib/db/client";
import { env } from "@/lib/config";

// We can just query directly or re-fetch from the API route 
// Since this is a Server Component, fetching direct from Prisma is fastest.
async function getDashboardData() {
  const clients = await prisma.client.findMany({
    include: {
      advisor: true,
      firm: true,
      documents: {
        select: { status: true, expiryDate: true },
      },
      _count: {
        select: { documents: true },
      },
    },
  });

  const demoDate = new Date(env.DEMO_DATE);
  
  // Transform and aggregate data
  const vaults = clients.map((client) => {
    let expiredCount = 0;
    let expiringSoonCount = 0;
    let missingCount = 0;

    client.documents.forEach((doc) => {
      if (doc.status === "EXPIRED") expiredCount++;
      if (doc.status === "EXPIRING_SOON") expiringSoonCount++;
      if (doc.status === "MISSING") missingCount++;

      // Compute derived dates as well
      if (doc.status === "VALID" && doc.expiryDate) {
        const daysUntilExpiry = Math.ceil(
          (doc.expiryDate.getTime() - demoDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (daysUntilExpiry <= 0) expiredCount++;
        else if (daysUntilExpiry <= 30) expiringSoonCount++;
      }
    });

    let highestUrgency = "NONE";
    if (expiredCount > 0) highestUrgency = "CRITICAL";
    else if (expiringSoonCount > 0) highestUrgency = "HIGH";
    else if (missingCount > 0) highestUrgency = "LOW";

    return {
      id: client.id,
      name: client.name,
      accountType: client.accountType,
      onboardingStatus: client.onboardingStatus,
      advisorName: client.advisor.name,
      documentCount: client._count.documents,
      urgency: {
        highest: highestUrgency,
        expired: expiredCount,
        expiringSoon: expiringSoonCount,
        missing: missingCount,
      },
    };
  });

  // Sort by urgency: CRITICAL > HIGH > MEDIUM > LOW > NONE
  const rank = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, NONE: 0 } as const;
  vaults.sort((a, b) => {
    return (rank[b.urgency.highest as keyof typeof rank] || 0) - (rank[a.urgency.highest as keyof typeof rank] || 0);
  });

  // Calculate summary metrics
  const summary = {
    totalClients: vaults.length,
    criticalClients: vaults.filter((v) => v.urgency.highest === "CRITICAL").length,
    issueClients: vaults.filter((v) => v.urgency.highest !== "NONE").length,
    secureClients: vaults.filter((v) => v.urgency.highest === "NONE").length,
  };

  return { vaults, summary };
}

export default async function DashboardPage() {
  const { vaults, summary } = await getDashboardData();

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">Operations Dashboard</h1>
        <p className="text-muted-foreground">Monitor and manage all client vaults with autonomous agents.</p>
      </div>

      <FirmSummaryBar {...summary} />
      
      <div className="pt-2">
        <h2 className="text-xl font-semibold mb-4 text-foreground">Active Vaults</h2>
        <VaultGrid vaults={vaults} />
      </div>
    </div>
  );
}
