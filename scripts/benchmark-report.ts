import { prisma } from "@/lib/db/client";

/**
 * Writes a short Markdown summary of the latest simulation run to stdout.
 * Use after `scripts/run-10k-benchmark.ts` or a large `/api/simulation/runs` POST.
 */
async function main() {
  const run = await prisma.simulationRun.findFirst({
    orderBy: { startedAt: "desc" },
  });

  if (!run) {
    console.log("# Benchmark report\n\nNo simulation runs found.");
    return;
  }

  const metrics =
    run.metrics && typeof run.metrics === "object"
      ? (run.metrics as Record<string, unknown>)
      : {};

  const lines = [
    "# Simulation benchmark report",
    "",
    `- **Run ID:** ${run.id}`,
    `- **Status:** ${run.status}`,
    `- **Clients:** ${run.clientCount}`,
    `- **Simulated days:** ${run.simulatedDays}`,
    `- **Batches:** ${run.batchesCompleted} / ${run.batchesTotal}`,
    `- **Started:** ${run.startedAt.toISOString()}`,
    run.completedAt ? `- **Completed:** ${run.completedAt.toISOString()}` : "",
    "",
    "## Metrics snapshot",
    "",
    "```json",
    JSON.stringify(metrics, null, 2),
    "```",
    "",
  ].filter(Boolean);

  console.log(lines.join("\n"));
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
