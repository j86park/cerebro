import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export async function GET() {
  try {
    const latestRun = await prisma.evalRun.findFirst({
      orderBy: { runAt: "desc" },
    });

    if (!latestRun) {
      return NextResponse.json({ error: "No evaluation runs found" }, { status: 404 });
    }

    return NextResponse.json(latestRun);
  } catch (error) {
    console.error("Failed to fetch latest eval run:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
