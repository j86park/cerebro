import { prisma } from "@/lib/db/client";
import { runSeed } from "../prisma/seed";

/**
 * Resets mutable demo data while preserving seeded baseline records.
 */
export async function resetDemo(): Promise<void> {
  await prisma.agentAction.deleteMany({
    where: {
      NOT: {
        outcome: "SEEDED_HISTORY",
      },
    },
  });

  // Explicitly reset runtime state for documents and clients before re-seeding
  // Strip runtime document state so seed upserts restore canonical demo rows per data-schema.
  await prisma.document.updateMany({
    data: {
      status: "MISSING",
      notes: null,
      uploadedAt: null,
      expiryDate: null,
      notificationCount: 0,
      lastNotifiedAt: null,
      fileRef: null,
    },
  });

  await prisma.client.updateMany({
    data: { onboardingStage: 0, onboardingStatus: "NOT_STARTED" },
  });

  await runSeed();
}

const isCli = process.argv[1]?.includes("reset-demo") ?? false;

if (isCli) {
  resetDemo()
    .then(async () => {
      await prisma.$disconnect();
      console.log("Reset complete.");
    })
    .catch(async (error: unknown) => {
      console.error("Reset failed:", error);
      await prisma.$disconnect();
      process.exit(1);
    });
}
