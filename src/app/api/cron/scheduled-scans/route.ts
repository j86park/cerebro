import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/config";
import { enqueueScheduledAgentScansForAllClients } from "@/lib/queue/scheduler";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/scheduled-scans — Vercel Cron / external scheduler entrypoint.
 * Secured with Authorization: Bearer <CRON_SECRET> or x-cron-secret header.
 */
export async function GET(request: NextRequest) {
  if (!env.CRON_SECRET) {
    return NextResponse.json(
      { error: "Cron is not configured (CRON_SECRET missing)" },
      { status: 503 }
    );
  }

  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const headerSecret = request.headers.get("x-cron-secret") ?? "";
  const secret = bearer || headerSecret;

  if (secret !== env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await enqueueScheduledAgentScansForAllClients();
    return NextResponse.json({ data: result });
  } catch (error) {
    console.error("[cron] scheduled-scans failed:", error);
    return NextResponse.json(
      { error: "Failed to enqueue scheduled scans" },
      { status: 500 }
    );
  }
}
