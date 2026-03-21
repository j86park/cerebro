import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

/**
 * Lists recent prompt mutation jobs for the testing dashboard.
 */
export async function GET() {
  try {
    const rows = await prisma.promptMutationJob.findMany({
      take: 20,
      orderBy: { createdAt: "desc" },
      include: {
        shadowRunResults: {
          orderBy: { createdAt: "asc" },
        },
        candidateVersion: {
          select: { id: true, mutationReason: true },
        },
      },
    });

    return NextResponse.json({ data: rows });
  } catch (error) {
    console.error("[API] Failed to load mutation jobs:", error);
    return NextResponse.json(
      {
        error: "Failed to load mutation jobs",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
