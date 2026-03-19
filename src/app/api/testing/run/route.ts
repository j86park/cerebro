import { NextResponse } from "next/server";
import { runAllEvals } from "@/evals/run";

export async function POST(req: Request) {
  try {
    const { batchSize = 3 } = await req.json().catch(() => ({}));
    
    console.log("[API] Triggering evaluation run...");
    const results = await runAllEvals(batchSize);
    
    return NextResponse.json(results);
  } catch (error) {
    console.error("[API] Failed to run evaluations:", error);
    return NextResponse.json(
      { 
        error: "Failed to run evaluations", 
        message: error instanceof Error ? error.message : String(error) 
      },
      { status: 500 }
    );
  }
}
