import { NextResponse } from "next/server";
import { getFirmSlaMetrics } from "@/lib/ops/service";

/**
 * GET /api/approvals/metrics — firm escalation_rate / timeout_rate (no email).
 */
export async function GET() {
  try {
    const metrics = await getFirmSlaMetrics();
    return NextResponse.json({ data: metrics });
  } catch (error) {
    console.error("GET /api/approvals/metrics error:", error);
    return NextResponse.json(
      { error: "Failed to compute approval SLA metrics" },
      { status: 500 },
    );
  }
}
