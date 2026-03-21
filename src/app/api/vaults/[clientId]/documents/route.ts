import { NextResponse } from "next/server";
import { VaultService } from "@/lib/db/vault-service";

/**
 * GET /api/vaults/[clientId]/documents — document list for one vault.
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
    const documents = await vault.getDocuments();
    return NextResponse.json({ data: documents });
  } catch (error) {
    console.error(`GET /api/vaults/${clientId}/documents error:`, error);
    return NextResponse.json(
      { error: "Failed to fetch documents" },
      { status: 500 }
    );
  }
}
