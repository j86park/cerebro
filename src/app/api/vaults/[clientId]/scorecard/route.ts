import { NextRequest, NextResponse } from "next/server";
import { VaultService } from "@/lib/db/vault-service";
import { getComplianceScorecard } from "@/lib/compliance/scorecard";
import { prisma } from "@/lib/db/client";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params;

  try {
    const vault = new VaultService({ clientId });
    const scorecard = await getComplianceScorecard(vault);

    // Fetch audit trail (last 10 agent actions for this client)
    const auditTrail = await prisma.agentAction.findMany({
      where: { clientId },
      orderBy: { performedAt: "desc" },
      take: 10,
      select: {
        id: true,
        agentType: true,
        actionType: true,
        outcome: true,
        reasoning: true,
        performedAt: true,
      }
    });

    return NextResponse.json({
      scorecard,
      auditTrail,
    });
  } catch (error) {
    console.error("[Cerebro][api][scorecard] Scorecard API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch scorecard data" },
      { status: 500 }
    );
  }
}
