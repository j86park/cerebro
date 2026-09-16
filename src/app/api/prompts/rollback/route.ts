import { NextResponse } from "next/server";
import { z } from "zod";
import { rollbackProduction } from "@/lib/prompt-ops";

const bodySchema = z.object({
  agentId: z.enum(["compliance", "onboarding"]),
  /** Explicit human acknowledgement for production rollback. */
  confirmHumanRollback: z.literal(true),
});

/**
 * Rolls production pointer back to the prior version without redeploy.
 */
export async function POST(req: Request) {
  try {
    const json: unknown = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid body", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const result = await rollbackProduction({ agentId: parsed.data.agentId });
    return NextResponse.json({ data: result });
  } catch (error) {
    console.error("[API] Prompt rollback failed:", error);
    return NextResponse.json(
      {
        error: "Prompt rollback failed",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
