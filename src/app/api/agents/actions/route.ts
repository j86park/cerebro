import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

/** Latest ledger entries for the dashboard; the stream only signals when to refresh. */
export async function GET() {
  try {
    const actions = await prisma.agentAction.findMany({
      orderBy: { performedAt: "desc" },
      take: 50,
      include: { client: { select: { name: true } } },
    });
    return NextResponse.json({ data: actions }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("GET /api/agents/actions error:", error);
    return NextResponse.json({ error: "Failed to fetch actions" }, { status: 500 });
  }
}
