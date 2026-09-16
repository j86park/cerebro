/**
 * CLI: export a failing EvalRun scenario row into a pending golden candidate.
 *
 * Usage:
 *   npx tsx scripts/export-eval-failure.ts --eval-run-id=<id> --client-id=CLT-003
 *
 * DRY_RUN does not skip candidate staging (local audit). Approved ship writes are gated
 * separately in promote-golden.ts via env.DRY_RUN.
 */
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import {
  exportFailureCandidateFromEvalRow,
  writeFailureCandidate,
} from "@/evals/golden";
import type { ScenarioEvalRow } from "@/evals/run";

const argsSchema = z.object({
  evalRunId: z.string().min(1),
  clientId: z.string().min(1),
});

function parseArgs(argv: string[]): { evalRunId: string; clientId: string } {
  const map = new Map<string, string>();
  for (const a of argv) {
    const m = /^--([^=]+)=(.*)$/.exec(a);
    if (m) map.set(m[1]!, m[2]!);
  }
  return argsSchema.parse({
    evalRunId: map.get("eval-run-id"),
    clientId: map.get("client-id"),
  });
}

async function main(): Promise<void> {
  const { evalRunId, clientId } = parseArgs(process.argv.slice(2));
  const run = await prisma.evalRun.findUnique({ where: { id: evalRunId } });
  if (!run) {
    throw new Error(`EvalRun not found: ${evalRunId}`);
  }

  const results = run.scenarioResults as Record<string, ScenarioEvalRow>;
  const row = results[clientId];
  if (!row) {
    throw new Error(`No scenario row for clientId=${clientId} in EvalRun ${evalRunId}`);
  }

  const agentType =
    row.agent === "ONBOARDING" || row.agent === "COMPLIANCE"
      ? row.agent
      : "COMPLIANCE";

  const candidate = exportFailureCandidateFromEvalRow({
    evalRunId,
    clientId,
    agentType,
    row,
  });

  const filePath = await writeFailureCandidate(candidate);
  console.log(
    JSON.stringify(
      {
        ok: true,
        candidateId: candidate.candidateId,
        filePath,
        approvalStatus: "pending",
        note: "Unapproved — will not enter ship gate until human promote",
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error("[export-eval-failure]", err);
  process.exit(1);
});
