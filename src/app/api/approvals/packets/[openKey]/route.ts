import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getApprovalPacket } from "@/lib/ops/service";

const paramsSchema = z.object({
  openKey: z.string().min(1),
});

const querySchema = z.object({
  clientId: z.string().min(1),
});

/**
 * GET /api/approvals/packets/[openKey]?clientId=… — single approval packet for decide UI.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ openKey: string }> },
) {
  try {
    const rawParams = await context.params;
    const params = paramsSchema.safeParse({
      openKey: decodeURIComponent(rawParams.openKey),
    });
    if (!params.success) {
      return NextResponse.json(
        { error: "Invalid openKey", details: params.error.flatten() },
        { status: 400 },
      );
    }

    const { searchParams } = new URL(request.url);
    const query = querySchema.safeParse({
      clientId: searchParams.get("clientId"),
    });
    if (!query.success) {
      return NextResponse.json(
        {
          error: "clientId query param required",
          details: query.error.flatten(),
        },
        { status: 400 },
      );
    }

    const packet = await getApprovalPacket({
      clientId: query.data.clientId,
      openKey: params.data.openKey,
    });

    if (!packet) {
      return NextResponse.json(
        { error: "Approval packet not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: packet });
  } catch (error) {
    console.error("GET /api/approvals/packets/[openKey] error:", error);
    return NextResponse.json(
      { error: "Failed to load approval packet" },
      { status: 500 },
    );
  }
}
