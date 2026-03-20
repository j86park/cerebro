import { NextResponse } from "next/server";
import { VaultService } from "@/lib/db/vault-service";

/**
 * GET /api/vaults/[clientId]/actions — full action log for one vault (newest first).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params;

  try {
    const vault = new VaultService({ clientId });
    if (!(await vault.vaultExists())) {
      return NextResponse.json({ error: "Vault not found" }, { status: 404 });
    }
    const actions = await vault.getActionHistory();
    return NextResponse.json({ data: actions });
  } catch (error) {
    console.error(`GET /api/vaults/${clientId}/actions error:`, error);
    return NextResponse.json(
      { error: "Failed to fetch actions" },
      { status: 500 }
    );
  }
}
