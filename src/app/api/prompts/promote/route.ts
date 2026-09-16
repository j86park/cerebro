import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/config";
import { promoteStagingToProduction } from "@/lib/prompt-ops";

const bodySchema = z.object({
  agentId: z.enum(["compliance", "onboarding"]),
  /**
   * Explicit acknowledgement that a human is promoting (never unsupervised).
   * REGULATORY: required for production pointer moves.
   */
  confirmHumanPromote: z.literal(true),
});

/**
 * Promotes staging → production for an agent. Human-gated; blocked when DRY_RUN alone is insufficient —
 * always requires confirmHumanPromote. Does not auto-promote REGULATORY prompt text.
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

    // Soft guard: production NODE_ENV still requires the human confirm flag (already enforced by schema).
    if (env.NODE_ENV === "production" && !parsed.data.confirmHumanPromote) {
      return NextResponse.json(
        { error: "Human confirmation required to promote production prompts" },
        { status: 403 },
      );
    }

    const result = await promoteStagingToProduction({
      agentId: parsed.data.agentId,
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    console.error("[API] Prompt promote failed:", error);
    return NextResponse.json(
      {
        error: "Prompt promote failed",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
