import { NextResponse } from "next/server";
import { SimulationOrchestrator } from "@/lib/simulation/orchestrator";

export const dynamic = "force-dynamic";

/**
 * GET /api/simulation/[runId] — single simulation run status and metrics.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;

  try {
    const orchestrator = new SimulationOrchestrator();
    const run = await orchestrator.getRun(runId);

    if (!run) {
      return NextResponse.json({ error: "Simulation run not found" }, { status: 404 });
    }

    return NextResponse.json({ data: run });
  } catch (error) {
    console.error(`GET /api/simulation/${runId} error:`, error);
    return NextResponse.json(
      { error: "Failed to fetch simulation run" },
      { status: 500 }
    );
  }
}
