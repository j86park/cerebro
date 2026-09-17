/**
 * CLI: fixture-first tool-mask (+ optional prompt-component) leave-one-out.
 * Always $0 OpenRouter — scores frozen trajectories with deterministic hard scorers.
 *
 * Usage:
 *   npm run eval:ablate
 *   npm run eval:ablate -- --fixture-ids=clt-003-pass,clt-001-pass
 *   npm run eval:ablate -- --no-prompt-components
 *
 * REGULATORY: ablation wins must not unsupervised-promote compliance prompts.
 * Live canary LOO is planned only when fixture LOO is inconclusive and
 * EVAL_LIVE_ABLATION=1 (see planBudgetedLiveCanaryLoo).
 */
import { z } from "zod";
import {
  isLiveAblationEnabled,
  planBudgetedLiveCanaryLoo,
  runFixtureToolMaskLoo,
} from "@/evals/fixture-ablation";

function parseFlags(argv: string[]): {
  fixtureIds?: string[];
  includePromptComponents: boolean;
  json: boolean;
} {
  const map = new Map<string, string | boolean>();
  for (const a of argv) {
    if (a === "--no-prompt-components") {
      map.set("noPromptComponents", true);
      continue;
    }
    if (a === "--json") {
      map.set("json", true);
      continue;
    }
    const m = /^--([^=]+)=(.*)$/.exec(a);
    if (m) map.set(m[1]!, m[2]!);
  }

  const schema = z.object({
    fixtureIds: z
      .string()
      .optional()
      .transform((v) =>
        v
          ? v
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined
      ),
    noPromptComponents: z.boolean().default(false),
    json: z.boolean().default(false),
  });

  const parsed = schema.parse({
    fixtureIds: map.get("fixture-ids"),
    noPromptComponents: map.get("noPromptComponents") === true,
    json: map.get("json") === true,
  });

  return {
    fixtureIds: parsed.fixtureIds,
    includePromptComponents: !parsed.noPromptComponents,
    json: parsed.json,
  };
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  const report = await runFixtureToolMaskLoo({
    fixtureIds: flags.fixtureIds,
    includePromptComponents: flags.includePromptComponents,
  });

  if (flags.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(
      `Fixture LOO: ${report.fixtureCount} fixture(s), ${report.arms.length} arm(s), OpenRouter $${report.openRouterSpendUsd}`
    );
    console.log(
      `Load-bearing tools: ${report.loadBearingTools.join(", ") || "(none)"}`
    );
    console.log(
      `Load-bearing prompt components: ${report.loadBearingComponents.join(", ") || "(none)"}`
    );
    if (report.inconclusive) {
      console.log(`Inconclusive: ${report.inconclusiveReason}`);
      if (isLiveAblationEnabled()) {
        const plan = planBudgetedLiveCanaryLoo({ fixtureReport: report });
        console.log(
          `Live LOO plan: ${plan.batches.length} batch(es), wave ${plan.sessionWaveId}, budget $${plan.budgetUsd}`
        );
      } else {
        console.log(
          "Live LOO not planned (set EVAL_LIVE_ABLATION=1 only when fixture LOO is inconclusive)."
        );
      }
    }
  }

  // Fixture path always succeeds as a report dump; exit 0 even if inconclusive.
  process.exit(0);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`eval:ablate failed: ${message}`);
  process.exit(1);
});
