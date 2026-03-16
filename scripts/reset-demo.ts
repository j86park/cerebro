import { prisma } from "@/lib/db/client";
import { runSeed } from "../prisma/seed";

/**
 * Resets mutable demo data while preserving seeded baseline records.
 */
export async function resetDemo() {
  await prisma.agentAction.deleteMany({
    where: {
      NOT: {
        outcome: "SEEDED_HISTORY",
      },
    },
  });

  // Explicitly reset runtime state for documents and clients before re-seeding
  await prisma.document.updateMany({
    data: { status: "MISSING", notes: null },
  });

  await prisma.client.updateMany({
    data: { onboardingStage: 1, onboardingStatus: "NOT_STARTED" },
  });

  await runSeed();
}

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
