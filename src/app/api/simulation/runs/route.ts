import { NextResponse } from "next/server";
import { SimulationOrchestrator } from "@/lib/simulation/orchestrator";
import { simulationStartSchema, startSimulationRun } from "@/lib/simulation/start";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const runs = await new SimulationOrchestrator().getRecentRuns(20);
    return NextResponse.json({ data: { runs } });
  } catch (error) {
    console.error("[API] Failed to fetch simulation runs:", error);
    return NextResponse.json({ error: "Failed to fetch simulation runs" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const parsed = simulationStartSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid simulation parameters", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    return NextResponse.json({ data: await startSimulationRun(parsed.data) }, { status: 201 });
  } catch (error) {
    console.error("[API] Failed to start simulation:", error);
    return NextResponse.json({ error: "Failed to start simulation" }, { status: 500 });
  }
}
