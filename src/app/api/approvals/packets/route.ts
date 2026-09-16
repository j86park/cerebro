import { NextRequest, NextResponse } from "next/server";
import { listApprovalPacketsQuerySchema } from "@/lib/ops/schemas";
import { listPendingApprovalPackets } from "@/lib/ops/service";

/**
 * GET /api/approvals/packets — pending HITL approval packets with ledger + vault evidence.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = listApprovalPacketsQuerySchema.safeParse({
      status: searchParams.get("status") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const packets = await listPendingApprovalPackets(parsed.data);
    return NextResponse.json({
      data: packets,
      total: packets.length,
    });
  } catch (error) {
    console.error("GET /api/approvals/packets error:", error);
    return NextResponse.json(
      { error: "Failed to list approval packets" },
      { status: 500 },
    );
  }
}
