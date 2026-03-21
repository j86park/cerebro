import type { Prisma } from "@prisma/client";
import { complianceScenarios } from "./scenarios/compliance.eval";
import { onboardingScenarios } from "./scenarios/onboarding.eval";
import { getComplianceAgent } from "@/agents/compliance/agent";
import { getOnboardingAgent } from "@/agents/onboarding/agent";
import { VaultService } from "@/lib/db/vault-service";
import { buildSharedTools } from "@/tools/shared";
import { buildComplianceTools } from "@/tools/compliance";
import { buildOnboardingTools } from "@/tools/onboarding";
import { prisma } from "@/lib/db/client";
import { env } from "@/lib/config";
import { assertEvalOverallScore } from "@/evals/threshold";
import {
  getMutationEnqueueDecision,
  recordMutationEnqueue,
} from "@/lib/mutation-circuit";
import { mutationAnalysisQueue } from "@/workers/queues";

type ScorerResultEntry = { score?: number; reason?: string };

export type ScenarioEvalRow = {
  agent: string;
  output?: string;
  error?: string;
  scores: Record<string, ScorerResultEntry>;
};

export type RunEvalsOptions = {
  /** When true, throws if overall score is below the milestone threshold (CLI / CI). */
  enforceThreshold?: boolean;
  /** Skip `EvalRun` persistence — used by shadow evals so history stays clean. */
  skipPersist?: boolean;
};

function scenarioHasFailure(row: ScenarioEvalRow): boolean {
  return Object.values(row.scores).some((s) => (s.score ?? 0) < 1);
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
}> {
  const enforceThreshold = options?.enforceThreshold ?? false;
  const skipPersist = options?.skipPersist ?? false;

  console.log(`[Cerebro][evals] Starting evaluation suite (batch size: ${batchSize})...`);
  const scenarios = [...complianceScenarios, ...onboardingScenarios];
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
          const sharedTools = buildSharedTools(vault);

          const agent =
            sc.agentType === "COMPLIANCE" ? complianceAgent : onboardingAgent;
          const toolsets =
            sc.agentType === "COMPLIANCE"
              ? { shared: sharedTools, compliance: buildComplianceTools(vault) }
              : { shared: sharedTools, onboarding: buildOnboardingTools(vault) };

          const result = await agent.generate(sc.input, {
            memory: { thread: sc.clientId, resource: sc.clientId },
            toolsets: toolsets as never,
          });

          const scores: Record<string, ScorerResultEntry> = {};

          if (sc.scorers) {
            for (const scorer of sc.scorers) {
              try {
                const scorerResult = await scorer.run({
                  output: result,
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
          }

          scenarioResults[sc.clientId] = {
            agent: sc.agentType,
            output: result.text,
            scores,
          };
        } catch (e) {
          console.error(`[Cerebro][evals] FAILED scenario for ${sc.clientId}:`, e);
          const failScores: Record<string, ScorerResultEntry> = {};
          sc.scorers?.forEach((scorer) => {
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

  if (!skipPersist) {
    evalRun = await prisma.evalRun.create({
      data: {
        gitCommit: env.GITHUB_SHA ?? "local",
        overallScore,
        scenarioResults: scenarioResults as unknown as Prisma.InputJsonValue,
        scorerBreakdown: scorerBreakdown as unknown as Prisma.InputJsonValue,
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
    assertEvalOverallScore(overallScore);
  }

  return {
    overallScore,
    scenarioResults,
    scorerBreakdown,
    evalRunId: evalRun.id,
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

  runAllEvals(batchSize, { enforceThreshold })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[Cerebro][evals]", err);
      process.exit(1);
    });
}
