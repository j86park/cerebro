import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params;

    const run = await prisma.evalRun.findUnique({
      where: { id: runId },
    });

    if (!run) {
      return NextResponse.json({ error: "Evaluation run not found" }, { status: 404 });
    }

    return NextResponse.json(run);
  } catch (error) {
    const { runId } = await params;
    console.error(`Failed to fetch eval run ${runId}:`, error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
