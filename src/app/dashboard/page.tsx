import { FirmSummaryBar } from "@/components/dashboard/FirmSummaryBar";
import { VaultGrid } from "@/components/dashboard/VaultGrid";
import { LiveAgentActivityFeed } from "@/components/dashboard/LiveAgentActivityFeed";
import { EscalationQueuePanel } from "@/components/dashboard/EscalationQueuePanel";
import { AgentControls } from "@/components/dashboard/AgentControls";
import { prisma } from "@/lib/db/client";
import { env } from "@/lib/config";

// We can just query directly or re-fetch from the API route 
// Since this is a Server Component, fetching direct from Prisma is fastest.
async function getDashboardData(page: number = 1) {
  const pageSize = 50;
  const skip = (page - 1) * pageSize;

  const [clients, totalCount] = await Promise.all([
    prisma.client.findMany({
      skip,
      take: pageSize,
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
    }),
    prisma.client.count()
  ]);

  const latestActions = await prisma.agentAction.findMany({
    orderBy: { performedAt: "desc" },
    take: 50,
    include: { client: { select: { name: true } } },
  });

  const rawEscalations = await prisma.agentAction.findMany({
    where: {
      actionType: { in: ["ESCALATE_COMPLIANCE", "ESCALATE_MANAGEMENT", "ALERT_ADVISOR_STUCK"] },
    },
    orderBy: { performedAt: "desc" },
    take: 15,
    include: { client: { select: { name: true } } },
  });

  // Basic deduplication to get unique current escalations
  const seenClients = new Set();
  const escalations = rawEscalations.filter((action: any) => {
    if (seenClients.has(action.clientId)) return false;
    seenClients.add(action.clientId);
    return true;
  }).map((e: any) => ({
    id: e.id,
    clientId: e.clientId,
    client: { name: e.client.name },
    reasoning: e.reasoning,
    stage: e.actionType,
    performedAt: e.performedAt.toISOString(),
  }));

  // Ensure JSON serialization of dates
  const initialActions = latestActions.map((a: any) => ({
    ...a,
    performedAt: a.performedAt.toISOString(),
    nextScheduledAt: a.nextScheduledAt?.toISOString() || null,
  }));

  const demoDate = new Date(env.DEMO_DATE);
  
  // Transform and aggregate data
  const vaults = clients.map((client: any) => {
    let expiredCount = 0;
    let expiringSoonCount = 0;
    let missingCount = 0;

    client.documents.forEach((doc: any) => {
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
  vaults.sort((a: any, b: any) => {
    return (rank[b.urgency.highest as keyof typeof rank] || 0) - (rank[a.urgency.highest as keyof typeof rank] || 0);
  });

  // Calculate summary metrics
  const summary = {
    totalClients: totalCount,
    criticalClients: vaults.filter((v: any) => v.urgency.highest === "CRITICAL").length, // This is only per page though
    issueClients: vaults.filter((v: any) => v.urgency.highest !== "NONE").length,
    secureClients: vaults.filter((v: any) => v.urgency.highest === "NONE").length,
  };

  return { vaults, summary, initialActions, escalations, clients, totalCount, pageSize };
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const resolvedSearchParams = await searchParams;
  const page = Number(resolvedSearchParams.page) || 1;
  const { vaults, summary, initialActions, escalations, clients, totalCount, pageSize } = await getDashboardData(page);

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">Operations Dashboard</h1>
        <p className="text-muted-foreground">Monitor and manage all client vaults with autonomous agents.</p>
      </div>

      <FirmSummaryBar {...summary} />
      
      <div className="flex flex-col lg:flex-row gap-6 pt-2">
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-semibold mb-4 text-foreground">Active Vaults</h2>
          <VaultGrid 
            vaults={vaults} 
            totalCount={totalCount} 
            pageSize={pageSize} 
            currentPage={page} 
          />
        </div>
        
        <div className="w-full lg:w-96 shrink-0 flex flex-col gap-6">
          <AgentControls clients={clients} />
          <EscalationQueuePanel escalations={escalations} />
          <LiveAgentActivityFeed initialActions={initialActions} />
        </div>
      </div>
    </div>
  );
}
