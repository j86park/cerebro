import type { Prisma } from "@prisma/client";
import { complianceScenarios } from "./scenarios/compliance.eval";
import { onboardingScenarios } from "./scenarios/onboarding.eval";
import { getComplianceAgent } from "@/agents/compliance/agent";
import { getOnboardingAgent } from "@/agents/onboarding/agent";
import { VaultService } from "@/lib/db/vault-service";
import { buildSharedTools } from "@/tools/shared";
import { buildComplianceTools } from "@/tools/compliance";
import { buildOnboardingTools } from "@/tools/onboarding";
import { assertAgentToolAllowlist } from "@/lib/policy/toolAllowlists";
import { buildClientMemoryScope } from "@/lib/queue/clientMemory";
import { prisma } from "@/lib/db/client";
import { buildLiveEvalSessionId, env } from "@/lib/config";
import {
  assertCanaryCiGates,
  assertEvalReleaseGates,
} from "@/evals/threshold";
import {
  getMutationEnqueueDecision,
  recordMutationEnqueue,
} from "@/lib/mutation-circuit";
import { mutationAnalysisQueue } from "@/workers/queues";
import { extractToolNamesFromOutput } from "@/evals/scorers/extract-tool-names";
import { loadApprovedEvalScenarios } from "@/evals/golden/load-approved";
import { getCanaryClientIdsAsync } from "@/lib/eval-scenario-utils";
import {
  escalationStageScorer,
  duplicateActionScorer,
  documentPriorityScorer,
  onboardingStageScorer,
  reasoningQualityScorer,
  trajectoryScorer,
} from "@/evals/scorers";
import {
  evalRunModeSchema,
  partitionHardThenSoft,
  shouldSkipSoftJudges,
  type EvalRunMode,
} from "@/evals/scorer-selection";
import {
  assertFullSuiteAllowedInCi,
  assertSuiteAllowsReleaseGate,
  parseSuiteSelectionFromArgs,
  resolveSuite,
  suiteSelectionSchema,
  type SuiteSelection,
} from "@/evals/suite-modes";
import {
  buildEvalRunMetadata,
} from "@/evals/judge-routing";
import type { AbstractScenario } from "@/evals/scenarios/scenario-types";
import type { EvalScenario } from "@/evals/ground-truth";

type ScorerResultEntry = { score?: number; reason?: string };

export type ScenarioEvalRow = {
  agent: string;
  output?: string;
  error?: string;
  scores: Record<string, ScorerResultEntry>;
  /** Ordered tool names for failure→golden mining (WP-P1.5). */
  toolNames?: string[];
};

/**
 * Builds AbstractScenario rows for human-approved goldens (ship gate only).
 */
function toAbstractFromEvalScenario(g: EvalScenario): AbstractScenario {
  const input = `You are running for client ${g.clientId}.\nThis run was triggered by: ${g.trigger}.\nStart by calling your observation tools to understand the current state of this client's vault.`;
  if (g.agentType === "COMPLIANCE") {
    return {
      clientId: g.clientId,
      agentType: "COMPLIANCE",
      canary: g.canary,
      stratum: g.stratum,
      sourceIncidentId: g.sourceIncidentId,
      input,
      expected: g.expected,
      scorers: [
        escalationStageScorer,
        duplicateActionScorer,
        documentPriorityScorer,
        trajectoryScorer,
        reasoningQualityScorer,
      ],
    };
  }
  return {
    clientId: g.clientId,
    agentType: "ONBOARDING",
    canary: g.canary,
    stratum: g.stratum,
    sourceIncidentId: g.sourceIncidentId,
    input,
    expected: g.expected,
    scorers: [
      onboardingStageScorer,
      duplicateActionScorer,
      trajectoryScorer,
      reasoningQualityScorer,
    ],
  };
}

export type RunEvalsOptions = {
  /** When true, throws if overall score is below the milestone threshold (CLI / CI). */
  enforceThreshold?: boolean;
  /** Skip `EvalRun` persistence — used by shadow evals so history stays clean. */
  skipPersist?: boolean;
  /**
   * When set, only run scenarios whose clientId is in this set.
   * Prefer `suite` (`canary` / `smoke` / `clientIds`) for named modes; this remains
   * for shadow `pass^k` trials and explicit overrides.
   */
  clientIds?: readonly string[];
  /**
   * Scorer attachment mode (PR1):
   * `canary-ci` = hard scorers only; `full` = hard + soft.
   * When omitted, defaults from `suite` (canary/smoke → canary-ci; full → full).
   */
  mode?: EvalRunMode;
  /**
   * Suite selection (PR2): which scenarios run — `canary` | `full` | `smoke` | `clientIds`.
   * Default `full` for backward compat; CI refuses full unless `EVAL_ALLOW_FULL_IN_CI`.
   */
  suite?: SuiteSelection;
};

function scenarioHasFailure(row: ScenarioEvalRow): boolean {
  return Object.values(row.scores).some((s) => (s.score ?? 0) < 1);
}

/**
 * Runs attached scorers hard-first; skips soft LLM judges on canary-ci or hard fail.
 */
async function runScenarioScorers(
  sc: AbstractScenario,
  output: unknown,
  mode: EvalRunMode
): Promise<Record<string, ScorerResultEntry>> {
  const scores: Record<string, ScorerResultEntry> = {};
  const attached = sc.scorers ?? [];
  const { hard, soft } = partitionHardThenSoft(attached);

  for (const scorer of hard) {
    try {
      const scorerResult = await scorer.run({
        output,
        groundTruth: sc.expected,
      });
      scores[scorer.id] = scorerResult as ScorerResultEntry;
    } catch (err) {
      console.error(
        `[Cerebro][evals] [${scorer.id}] scorer failed on client ${sc.clientId}:`,
        err
      );
      scores[scorer.id] = { score: 0, reason: String(err) };
    }
  }

  if (shouldSkipSoftJudges(mode, scores)) {
    return scores;
  }

  for (const scorer of soft) {
    try {
      const scorerResult = await scorer.run({
        output,
        groundTruth: sc.expected,
      });
      scores[scorer.id] = scorerResult as ScorerResultEntry;
    } catch (err) {
      console.error(
        `[Cerebro][evals] [${scorer.id}] scorer failed on client ${sc.clientId}:`,
        err
      );
      scores[scorer.id] = { score: 0, reason: String(err) };
    }
  }

  return scores;
}

/**
 * Runs all compliance + onboarding eval scenarios, persists an `EvalRun`, and optionally enforces score gate.
 */
export async function runAllEvals(
  batchSize: number = 3,
  options?: RunEvalsOptions
): Promise<{
  overallScore: number;
  scenarioResults: Record<string, ScenarioEvalRow>;
  scorerBreakdown: Record<string, { total: number; passed: number }>;
  evalRunId: string;
  mode: EvalRunMode;
  suite: SuiteSelection;
  /** False for smoke / exploratory clientIds — must not be treated as release quality. */
  isFinal: boolean;
}> {
  const enforceThreshold = options?.enforceThreshold ?? false;
  const skipPersist = options?.skipPersist ?? false;

  // Ship gate = GROUND_TRUTH wrappers + human-approved goldens only (never candidates/).
  const approvedGoldenScenarios = (await loadApprovedEvalScenarios()).map(
    toAbstractFromEvalScenario
  );
  const catalog = [
    ...complianceScenarios,
    ...onboardingScenarios,
    ...approvedGoldenScenarios,
  ];
  const catalogIds = catalog.map((sc) => sc.clientId);

  // Explicit `clientIds` option wins (shadow pass^k); else named suite selection.
  const suiteSelection: SuiteSelection =
    options?.clientIds !== undefined
      ? suiteSelectionSchema.parse({
          mode: "clientIds",
          clientIds: [...options.clientIds],
        })
      : suiteSelectionSchema.parse(options?.suite ?? { mode: "full" });

  const canaryIds = new Set(await getCanaryClientIdsAsync());
  const suiteResolution = resolveSuite(suiteSelection, catalogIds, canaryIds);
  const clientIdFilter = new Set(suiteResolution.clientIds);
  const mode = evalRunModeSchema.parse(
    options?.mode ?? suiteResolution.defaultScorerMode
  );
  const isFinal = suiteResolution.isFinal;

  console.log(
    `[Cerebro][evals] Starting evaluation suite (batch size: ${batchSize}, suite: ${suiteSelection.mode}, scorerMode: ${mode}, isFinal: ${isFinal})...`
  );

  const scenarios = catalog.filter((sc) => clientIdFilter.has(sc.clientId));
  const scenarioResults: Record<string, ScenarioEvalRow> = {};
  const scorerBreakdown: Record<string, { total: number; passed: number }> = {};
  let totalScore = 0;
  let maxScore = 0;

  const [complianceAgent, onboardingAgent] = await Promise.all([
    getComplianceAgent(),
    getOnboardingAgent(),
  ]);

  const chunks: (typeof scenarios)[] = [];
  for (let i = 0; i < scenarios.length; i += batchSize) {
    chunks.push(scenarios.slice(i, i + batchSize));
  }

  for (const chunk of chunks) {
    console.log(`[Cerebro][evals] Processing batch of ${chunk.length} scenario(s)...`);

    await Promise.all(
      chunk.map(async (sc) => {
        try {
          console.log(
            `[Cerebro][evals] Evaluating ${sc.agentType} scenario for client ${sc.clientId}...`
          );
          const vault = new VaultService({ clientId: sc.clientId });
          const sharedTools = buildSharedTools(vault, {
            agentType: sc.agentType,
          });
          const domainTools =
            sc.agentType === "COMPLIANCE"
              ? buildComplianceTools(vault)
              : buildOnboardingTools(vault);
          const domain =
            sc.agentType === "COMPLIANCE" ? "compliance" : "onboarding";
          assertAgentToolAllowlist(domain, [
            ...Object.keys(sharedTools),
            ...Object.keys(domainTools),
          ]);

          const agent =
            sc.agentType === "COMPLIANCE" ? complianceAgent : onboardingAgent;
          const toolsets =
            sc.agentType === "COMPLIANCE"
              ? { shared: sharedTools, compliance: domainTools }
              : { shared: sharedTools, onboarding: domainTools };

          const result = await agent.generate(sc.input, {
            memory: buildClientMemoryScope(sc.clientId),
            toolsets: toolsets as never,
          });

          const scores = await runScenarioScorers(sc, result, mode);

          scenarioResults[sc.clientId] = {
            agent: sc.agentType,
            output: result.text,
            toolNames: extractToolNamesFromOutput(result),
            scores,
          };
        } catch (e) {
          console.error(`[Cerebro][evals] FAILED scenario for ${sc.clientId}:`, e);
          const failScores: Record<string, ScorerResultEntry> = {};
          const { hard, soft } = partitionHardThenSoft(sc.scorers ?? []);
          const toFail = mode === "canary-ci" ? hard : [...hard, ...soft];
          toFail.forEach((scorer) => {
            failScores[scorer.id] = {
              score: 0,
              reason: "Agent Execution Failed: " + String(e),
            };
          });
          scenarioResults[sc.clientId] = {
            agent: sc.agentType,
            error: String(e),
            scores: failScores,
          };
        }
      })
    );
  }

  Object.values(scenarioResults).forEach((res) => {
    if (res.scores) {
      Object.entries(res.scores).forEach(([scorerId, scoreObj]) => {
        if (!scorerBreakdown[scorerId]) {
          scorerBreakdown[scorerId] = { total: 0, passed: 0 };
        }
        const val = scoreObj?.score ?? 0;
        totalScore += val;
        maxScore += 1;
        scorerBreakdown[scorerId].total += 1;
        if (val === 1.0) {
          scorerBreakdown[scorerId].passed += 1;
        }
      });
    }
  });

  const overallScore = maxScore > 0 ? totalScore / maxScore : 0;
  console.log(
    `[Cerebro][evals] Final stats: totalScore=${totalScore}, maxScore=${maxScore}, overallScore=${overallScore}`
  );

  console.log(`[Cerebro][evals] ========================================`);
  console.log(
    `[Cerebro][evals] Eval suite completed. Overall score: ${(overallScore * 100).toFixed(1)}%`
  );
  console.log(`[Cerebro][evals] ========================================`);

  let evalRun: { id: string } = { id: "dry-run" };

  // Sticky session id for live OpenRouter prefix caching across this eval wave.
  // Default unit Vitest never hits OpenRouter; real/live jobs reuse this stamp.
  const liveSessionId = buildLiveEvalSessionId(
    `${suiteSelection.mode}-${env.GITHUB_SHA ?? "local"}`
  );

  if (!skipPersist) {
    const metadata = buildEvalRunMetadata({
      suite: suiteSelection,
      mode,
      isFinal,
      liveSessionId,
      // Fixture / default CI stays $0 — live jobs should pass measured spend later.
      spendUsd: 0,
    });

    evalRun = await prisma.evalRun.create({
      data: {
        gitCommit: env.GITHUB_SHA ?? "local",
        overallScore,
        scenarioResults: scenarioResults as unknown as Prisma.InputJsonValue,
        scorerBreakdown: scorerBreakdown as unknown as Prisma.InputJsonValue,
        metadata: metadata as unknown as Prisma.InputJsonValue,
      },
    });

    const anyFailed = Object.values(scenarioResults).some(scenarioHasFailure);
    if (anyFailed) {
      const decision = await getMutationEnqueueDecision();
      if (!decision.allowed) {
        console.warn(
          `[Cerebro][evals] Skipping mutation-analysis (${decision.reason}): ${decision.detail ?? ""}`
        );
      } else {
        try {
          await mutationAnalysisQueue.add("analyze", { evalRunId: evalRun.id });
          await recordMutationEnqueue();
        } catch (err) {
          console.error(
            "[Cerebro][evals] Failed to enqueue mutation-analysis job (is Redis running?):",
            err
          );
        }
      }
    }
  }

  if (enforceThreshold) {
    // REGULATORY: smoke / non-final suites must never enforce release or ship gates.
    assertSuiteAllowsReleaseGate(suiteSelection);
    const canaryClientIds = await getCanaryClientIdsAsync();
    if (mode === "canary-ci" || suiteSelection.mode === "canary") {
      // Hard-only canary ship path — soft average threshold is nightly/full only.
      assertCanaryCiGates(scenarioResults, canaryClientIds);
    } else {
      assertEvalReleaseGates(overallScore, scenarioResults, canaryClientIds);
    }
  }

  return {
    overallScore,
    scenarioResults,
    scorerBreakdown,
    evalRunId: evalRun.id,
    mode,
    suite: suiteSelection,
    isFinal,
  };
}

const argvScript = process.argv[1]?.replace(/\\/g, "/") ?? "";
const isMain =
  argvScript.endsWith("src/evals/run.ts") || argvScript.endsWith("evals/run.ts");
if (isMain) {
  const args = process.argv.slice(2);
  const batchIdx = args.indexOf("--batch-size");
  const batchSize =
    batchIdx !== -1 ? parseInt(args[batchIdx + 1] ?? "3", 10) : 3;
  const enforceThreshold = args.includes("--enforce-threshold");
  const suite = parseSuiteSelectionFromArgs(args);
  // CLI / npm scripts refuse full×live under CI unless explicitly opted in.
  // Programmatic callers (mocked unit coverage, shadow clientIds) are not gated here.
  assertFullSuiteAllowedInCi(suite);
  // Scorer mode: explicit --canary-ci forces hard-only; else follow suite default.
  const scorerMode: EvalRunMode | undefined = args.includes("--canary-ci")
    ? "canary-ci"
    : undefined;

  runAllEvals(batchSize, {
    enforceThreshold,
    suite,
    mode: scorerMode,
  })
    .then((result) => {
      if (!result.isFinal) {
        console.warn(
          `[Cerebro][evals] Suite "${result.suite.mode}" is NON-FINAL — do not treat overallScore=${result.overallScore.toFixed(3)} as a release gate.`
        );
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error("[Cerebro][evals]", err);
      process.exit(1);
    });
}
