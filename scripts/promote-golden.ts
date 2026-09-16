/**
 * CLI: human-approve a pending failure candidate into a versioned ship-gate golden.
 *
 * Usage:
 *   DRY_RUN=true  npx tsx scripts/promote-golden.ts --candidate-id=cand-xxx --approve --approved-by=alice --regulatory-confirmed
 *   DRY_RUN=false npx tsx scripts/promote-golden.ts --candidate-id=cand-xxx --approve --approved-by=alice --regulatory-confirmed
 *
 * Without --approve the script exits non-zero (no unsupervised promote).
 * REGULATORY: --regulatory-confirmed is required; lessons are not auto-appended.
 */
import { z } from "zod";
import { env } from "@/lib/config";
import {
  promoteGoldenToApproved,
  rejectFailureCandidate,
} from "@/evals/golden";

function parseFlags(argv: string[]): {
  candidateId: string;
  approve: boolean;
  reject: boolean;
  approvedBy: string;
  regulatoryConfirmed: boolean;
  reason?: string;
  dryRun?: boolean;
} {
  const map = new Map<string, string | boolean>();
  for (const a of argv) {
    if (a === "--approve") {
      map.set("approve", true);
      continue;
    }
    if (a === "--reject") {
      map.set("reject", true);
      continue;
    }
    if (a === "--regulatory-confirmed") {
      map.set("regulatoryConfirmed", true);
      continue;
    }
    const m = /^--([^=]+)=(.*)$/.exec(a);
    if (m) map.set(m[1]!, m[2]!);
  }

  const schema = z.object({
    candidateId: z.string().min(1),
    approve: z.boolean().default(false),
    reject: z.boolean().default(false),
    approvedBy: z.string().min(1).default("cli-operator"),
    regulatoryConfirmed: z.boolean().default(false),
    reason: z.string().optional(),
    dryRun: z
      .string()
      .optional()
      .transform((v) => (v === undefined ? undefined : v === "true")),
  });

  return schema.parse({
    candidateId: map.get("candidate-id"),
    approve: map.get("approve") === true,
    reject: map.get("reject") === true,
    approvedBy: map.get("approved-by") ?? map.get("rejected-by") ?? "cli-operator",
    regulatoryConfirmed: map.get("regulatoryConfirmed") === true,
    reason: map.get("reason"),
    dryRun: map.get("dry-run"),
  });
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));

  if (flags.reject) {
    const out = await rejectFailureCandidate({
      candidateId: flags.candidateId,
      rejectedBy: flags.approvedBy,
      reason: flags.reason ?? "rejected by operator",
    });
    console.log(JSON.stringify({ ok: true, rejected: true, path: out }, null, 2));
    return;
  }

  if (!flags.approve) {
    throw new Error(
      "Refusing unsupervised promote — pass --approve (and --regulatory-confirmed) after human review"
    );
  }

  if (!flags.regulatoryConfirmed) {
    throw new Error(
      "REGULATORY: pass --regulatory-confirmed after verifying scenario expectations"
    );
  }

  const result = await promoteGoldenToApproved({
    candidateId: flags.candidateId,
    approve: true,
    approvedBy: flags.approvedBy,
    regulatoryConfirmed: true,
    dryRun: flags.dryRun ?? env.DRY_RUN,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        dryRun: result.dryRun,
        written: result.written,
        fileName: result.fileName,
        filePath: result.filePath,
        scenarioId: result.golden.scenarioId,
        version: result.golden.version,
        shipGateNote: result.written
          ? "Golden is now in approved-manifest — will load into offline ship suite"
          : "DRY_RUN: no ship-gate write; candidate remains pending",
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error("[promote-golden]", err);
  process.exit(1);
});
