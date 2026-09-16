import { NextResponse } from "next/server";
import { z } from "zod";
import {
  listPendingCandidateIds,
  loadApprovedGoldens,
  readFailureCandidate,
  readApprovedManifest,
} from "@/evals/golden";

export const dynamic = "force-dynamic";

/**
 * Lists pending golden candidates and approved ship-gate goldens (read-only).
 */
export async function GET() {
  try {
    const candidateIds = await listPendingCandidateIds();
    const candidates = await Promise.all(
      candidateIds.map(async (id) => {
        try {
          return await readFailureCandidate(id);
        } catch {
          return { candidateId: id, error: "unreadable" };
        }
      })
    );
    const manifest = await readApprovedManifest();
    const approved = await loadApprovedGoldens();

    return NextResponse.json({
      data: {
        candidates,
        approvedManifest: manifest,
        approvedGoldens: approved.map((g) => ({
          scenarioId: g.scenarioId,
          version: g.version,
          clientId: g.scenario.clientId,
          approvedBy: g.approvedBy,
          approvedAt: g.approvedAt,
        })),
      },
    });
  } catch (error) {
    console.error("[Cerebro][api][goldens] list failed:", error);
    return NextResponse.json(
      { error: "Failed to list golden candidates" },
      { status: 500 }
    );
  }
}

const exportBodySchema = z.object({
  action: z.literal("noop"),
});

/**
 * POST reserved — use /api/testing/goldens/approve for human promote.
 * Keeps unsupervised workers from POSTing promotes to this collection route.
 */
export async function POST(req: Request) {
  try {
    const body = exportBodySchema.safeParse(await req.json().catch(() => ({})));
    if (!body.success) {
      return NextResponse.json(
        {
          error:
            "Use POST /api/testing/goldens/approve with explicit approve + regulatoryConfirmed",
        },
        { status: 400 }
      );
    }
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    console.error("[Cerebro][api][goldens] POST failed:", error);
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
