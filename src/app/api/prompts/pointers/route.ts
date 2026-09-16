import { NextResponse } from "next/server";
import { z } from "zod";
import { getEnvironmentPointers } from "@/lib/prompt-ops";

const querySchema = z.object({
  agentId: z.enum(["compliance", "onboarding"]),
});

/**
 * Lists staging/production prompt pointers for an agent (ops / testing UI).
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = querySchema.safeParse({
      agentId: url.searchParams.get("agentId") ?? "compliance",
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid agentId", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const pointers = await getEnvironmentPointers(parsed.data.agentId);
    return NextResponse.json({ data: { agentId: parsed.data.agentId, pointers } });
  } catch (error) {
    console.error("[API] Failed to load prompt pointers:", error);
    return NextResponse.json(
      {
        error: "Failed to load prompt pointers",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
