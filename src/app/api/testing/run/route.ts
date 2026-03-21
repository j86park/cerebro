import { NextResponse } from "next/server";
import { runAllEvals } from "@/evals/run";

export async function POST(req: Request) {
  try {
    const { batchSize = 3 } = await req.json().catch(() => ({}));

    console.log("[Cerebro][api][testing] Triggering evaluation run...");
    const results = await runAllEvals(batchSize, { enforceThreshold: false });

    return NextResponse.json({ data: results });
  } catch (error) {
    console.error("[Cerebro][api][testing] Failed to run evaluations:", error);
    return NextResponse.json(
      { 
        error: "Failed to run evaluations", 
        message: error instanceof Error ? error.message : String(error) 
      },
      { status: 500 }
    );
  }
}
