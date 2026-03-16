import { NextRequest, NextResponse } from "next/server";
import { VaultService } from "@/lib/db/vault-service";
import { prisma } from "@/lib/db/client";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params;

  try {
    // Verify client exists first to handle 404
    const clientExists = await prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true },
    });

    if (!clientExists) {
      return NextResponse.json({ error: "Vault not found" }, { status: 404 });
    }

    const vault = new VaultService({ clientId });

    // Fetch all vault details concurrently
    const [profile, documents, actions] = await Promise.all([
      vault.getClientProfile(),
      vault.getDocuments(),
      vault.getActionHistory(),
    ]);

    // Limit actions to most recent 50 for the UI
    const recentActions = actions.slice(0, 50);

    return NextResponse.json({
      profile,
      documents,
      actions: recentActions,
    });
  } catch (error) {
    console.error(`GET /api/vaults/${clientId} error:`, error);
    return NextResponse.json(
      { error: "Failed to fetch vault details" },
      { status: 500 }
    );
  }
}
