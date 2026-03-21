import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from "@/components/ui/tabs";
import { ComplianceScorecard } from "@/components/dashboard/ComplianceScorecard";
import { ClientProfileCard } from "@/components/vault/ClientProfileCard";
import { DocumentsTable } from "@/components/vault/DocumentsTable";
import { ActionHistoryFeed } from "@/components/vault/ActionHistoryFeed";
import type { Advisor, AgentAction, Client, Document, Firm } from "@prisma/client";
import { VaultService } from "@/lib/db/vault-service";
import type { DocumentData } from "@/components/vault/DocumentsTable";
import type { ActionData } from "@/components/vault/ActionHistoryFeed";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";

type ClientProfileWithRelations = Client & {
  advisor: Advisor;
  firm: Firm;
};

export default async function VaultDetailPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  
  try {
    const vault = new VaultService({ clientId });
    
    const profile = (await vault
      .getClientProfile()
      .catch(() => null)) as ClientProfileWithRelations | null;

    if (!profile) {
      notFound();
    }

    const documents = (await vault.getDocuments()) as Document[];
    const actions = (await vault.getActionHistory()) as AgentAction[];

    const profileData = {
      clientId: profile.id,
      name: profile.name,
      email: profile.email,
      accountType: profile.accountType,
      onboardingStatus: profile.onboardingStatus,
      onboardingStage: profile.onboardingStage,
      advisorName: profile.advisor.name,
      firmName: profile.firm.name,
    };

    const safeDocuments: DocumentData[] = documents.map((d) => ({
      id: d.id,
      type: d.type,
      category: d.category,
      status: d.status,
      expiryDate: d.expiryDate?.toISOString() ?? null,
      uploadedAt: d.uploadedAt?.toISOString() ?? null,
      notificationCount: d.notificationCount ?? 0,
    }));

    const safeActions: ActionData[] = actions.slice(0, 50).map((a) => ({
      id: a.id,
      performedAt: a.performedAt.toISOString(),
      agentType: a.agentType,
      actionType: a.actionType,
      trigger: a.trigger,
      reasoning: a.reasoning,
      outcome: a.outcome,
    }));

    return (
      <div className="space-y-6 max-w-[1600px] mx-auto h-full flex flex-col">
        <div className="shrink-0 flex items-center justify-between">
          <div>
            <Link 
              href="/dashboard" 
              className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-2 transition-colors"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back to Operations
            </Link>
            <h1 className="text-3xl font-bold tracking-tight">Vault Intelligence: {profile.name}</h1>
          </div>
        </div>

        <div className="flex-1 min-h-0">
          <Tabs defaultValue="overview" className="h-full flex flex-col space-y-4">
            <TabsList className="shrink-0 w-fit">
              <TabsTrigger value="overview">Client Overview</TabsTrigger>
              <TabsTrigger value="compliance">Compliance Scorecard & Audit</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="flex-1 min-h-0 focus-visible:ring-0">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
                <div className="lg:col-span-2 space-y-6 overflow-y-auto pr-2 pb-6">
                  <ClientProfileCard profile={profileData} />
                  
                  <div className="pt-2">
                    <h2 className="text-xl font-semibold mb-4 text-foreground">Document Registry</h2>
                    <DocumentsTable documents={safeDocuments} />
                  </div>
                </div>
                
                <div className="lg:col-span-1 h-full pb-6">
                  <ActionHistoryFeed clientId={profileData.clientId} initialActions={safeActions} />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="compliance" className="flex-1 min-h-0 overflow-y-auto pb-6 focus-visible:ring-0">
              <div className="max-w-5xl">
                <ComplianceScorecard clientId={clientId} />
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    );
  } catch (error) {
    console.error("[Cerebro][vault-detail] Error loading vault detail page:", error);
    notFound();
  }
}
