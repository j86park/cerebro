import type { AgentAction } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { VaultService } from "@/lib/db/vault-service";

const querySchema = z.object({
  format: z.enum(["csv", "json"]).default("csv"),
});

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * GET /api/vaults/[clientId]/actions/export — audit log export (CSV or JSON).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params;

  try {
    const parsedQuery = querySchema.safeParse({
      format: request.nextUrl.searchParams.get("format") ?? "csv",
    });
    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: "Invalid query", details: parsedQuery.error.flatten() },
        { status: 400 }
      );
    }
    const { format } = parsedQuery.data;

    const vault = new VaultService({ clientId });
    if (!(await vault.vaultExists())) {
      return NextResponse.json({ error: "Vault not found" }, { status: 404 });
    }

    const actions = (await vault.getActionHistory()) as AgentAction[];

    if (format === "json") {
      return NextResponse.json({ data: actions });
    }

    const header = [
      "id",
      "performedAt",
      "agentType",
      "actionType",
      "trigger",
      "outcome",
      "reasoning",
    ].join(",");

    const lines = actions.map((a) => {
      const row = [
        a.id,
        a.performedAt.toISOString(),
        a.agentType,
        a.actionType,
        a.trigger,
        a.outcome ?? "",
        a.reasoning,
      ].map((c) => escapeCsvCell(String(c)));
      return row.join(",");
    });

    const csv = [header, ...lines].join("\n");
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="vault-${clientId}-actions.csv"`,
      },
    });
  } catch (error) {
    console.error(`GET /api/vaults/${clientId}/actions/export error:`, error);
    return NextResponse.json(
      { error: "Failed to export actions" },
      { status: 500 }
    );
  }
}
