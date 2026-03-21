import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { env } from "@/lib/config";

type ClientWithVaultData = Prisma.ClientGetPayload<{
  include: {
    advisor: true;
    firm: true;
    documents: { select: { status: true; expiryDate: true } };
    _count: { select: { documents: true } };
  };
}>;

export async function GET() {
  try {
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
      orderBy: { name: "asc" },
    });

    const demoDate = new Date(env.DEMO_DATE);

    const enrichedClients = clients.map((client: ClientWithVaultData) => {
      let expiredCount = 0;
      let expiringSoonCount = 0;
      let missingCount = 0;

      client.documents.forEach((doc) => {
        if (doc.status === "EXPIRED") expiredCount++;
        if (doc.status === "EXPIRING_SOON") expiringSoonCount++;
        if (doc.status === "MISSING") missingCount++;

        // Also check derived status based on date if status is not correctly set yet
        if (doc.status === "VALID" && doc.expiryDate) {
          const daysUntilExpiry = Math.ceil(
            (doc.expiryDate.getTime() - demoDate.getTime()) / (1000 * 60 * 60 * 24)
          );
          if (daysUntilExpiry <= 0) expiredCount++;
          else if (daysUntilExpiry <= 30) expiringSoonCount++;
        }
      });

      // Calculate highest urgency
      let highestUrgency = "NONE";
      if (expiredCount > 0) highestUrgency = "CRITICAL";
      else if (expiringSoonCount > 0) highestUrgency = "HIGH";
      else if (missingCount > 0) highestUrgency = "LOW";

      return {
        id: client.id,
        name: client.name,
        email: client.email,
        accountType: client.accountType,
        onboardingStatus: client.onboardingStatus,
        onboardingStage: client.onboardingStage,
        advisorName: client.advisor.name,
        firmName: client.firm.name,
        documentCount: client._count.documents,
        urgency: {
          highest: highestUrgency,
          expired: expiredCount,
          expiringSoon: expiringSoonCount,
          missing: missingCount,
        },
      };
    });

    return NextResponse.json({ data: enrichedClients });
  } catch (error) {
    console.error("GET /api/vaults error:", error);
    return NextResponse.json(
      { error: "Failed to fetch vaults" },
      { status: 500 }
    );
  }
}
