import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/config";
import {
  promoteGoldenToApproved,
  rejectFailureCandidate,
} from "@/evals/golden";

export const dynamic = "force-dynamic";

const approveBodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("approve"),
    candidateId: z.string().min(1),
    approvedBy: z.string().min(1),
    /** REGULATORY: human confirms expectations are correct — required. */
    regulatoryConfirmed: z.literal(true),
    /** Optional override; defaults to env.DRY_RUN (skip ship write when true). */
    dryRun: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("reject"),
    candidateId: z.string().min(1),
    rejectedBy: z.string().min(1),
    reason: z.string().min(1),
  }),
]);

/**
 * Human approve / reject for failure→golden promotion.
 * Never auto-called from mutation/shadow workers — explicit human gate only.
 */
export async function POST(req: Request) {
  try {
    const parsed = approveBodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid approve payload",
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const body = parsed.data;

    if (body.action === "reject") {
      const path = await rejectFailureCandidate({
        candidateId: body.candidateId,
        rejectedBy: body.rejectedBy,
        reason: body.reason,
      });
      return NextResponse.json({
        data: { rejected: true, path },
      });
    }

    const result = await promoteGoldenToApproved({
      candidateId: body.candidateId,
      approve: true,
      approvedBy: body.approvedBy,
      regulatoryConfirmed: true,
      dryRun: body.dryRun ?? env.DRY_RUN,
    });

    return NextResponse.json({
      data: {
        dryRun: result.dryRun,
        written: result.written,
        fileName: result.fileName,
        filePath: result.filePath,
        golden: result.golden,
      },
    });
  } catch (error) {
    console.error("[Cerebro][api][goldens][approve] failed:", error);
    return NextResponse.json(
      {
        error: "Golden approve failed",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
