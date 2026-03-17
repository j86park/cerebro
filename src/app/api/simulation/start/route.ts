import { NextRequest, NextResponse } from "next/server";
import { SimulationOrchestrator } from "@/lib/simulation/orchestrator";
import { z } from "zod";

const startSchema = z.object({
  clientCount: z.number().int().positive(),
  simulatedDays: z.number().int().positive(),
  clientResponseRate: z.number().min(0).max(1).default(0.8),
  advisorResponseRate: z.number().min(0).max(1).default(0.9),
  randomSeed: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = startSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: "Invalid parameters", details: validated.error.format() },
        { status: 400 }
      );
    }

    const orchestrator = new SimulationOrchestrator();
    const run = await orchestrator.createSimulationRun(validated.data);

    // TODO: In Phase 8.3, we will trigger the first batch/tick here
    
    return NextResponse.json(run, { status: 201 });
  } catch (error) {
    console.error("Failed to start simulation:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
