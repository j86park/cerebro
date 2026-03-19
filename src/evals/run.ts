import { complianceScenarios } from "./scenarios/compliance.eval";
import { onboardingScenarios } from "./scenarios/onboarding.eval";
import { complianceAgent } from "@/agents/compliance/agent";
import { onboardingAgent } from "@/agents/onboarding/agent";
import { VaultService } from "@/lib/db/vault-service";
import { buildSharedTools } from "@/tools/shared";
import { buildComplianceTools } from "@/tools/compliance";
import { buildOnboardingTools } from "@/tools/onboarding";
import { prisma } from "@/lib/db/client";

export async function runAllEvals(batchSize: number = 3) {
  console.log(`Starting Evaluation Suite (Batch Size: ${batchSize})...`);
  const scenarios = [...complianceScenarios, ...onboardingScenarios];
  const scenarioResults: Record<string, any> = {};
  const scorerBreakdown: Record<string, { total: number; passed: number }> = {};
  let totalScore = 0;
  let maxScore = 0;

  // Chunking helper
  const chunks = [];
  for (let i = 0; i < scenarios.length; i += batchSize) {
    chunks.push(scenarios.slice(i, i + batchSize));
  }

  for (const chunk of chunks) {
    console.log(`\n--- Processing Batch of ${chunk.length} Scenarios ---`);
    
    await Promise.all(chunk.map(async (sc) => {
      try {
        console.log(`Evaluating ${sc.agentType} scenario for client ${sc.clientId}...`);
        const vault = new VaultService({ clientId: sc.clientId });
        const sharedTools = buildSharedTools(vault);
        
        let agent, toolsets;
        if (sc.agentType === "COMPLIANCE") {
          agent = complianceAgent;
          toolsets = { shared: sharedTools, compliance: buildComplianceTools(vault) };
        } else {
          agent = onboardingAgent;
          toolsets = { shared: sharedTools, onboarding: buildOnboardingTools(vault) };
        }

        const result = await agent.generate(sc.input, {
          memory: { thread: sc.clientId, resource: sc.clientId },
          toolsets
        });

        const scores: Record<string, any> = {};

        if (sc.scorers) {
          for (const scorer of sc.scorers) {
            try {
              const scorerResult = await scorer.run({
                output: result,
                groundTruth: sc.expected
              });
              
              scores[scorer.id] = scorerResult;
            } catch (err) {
              console.error(`  - [${scorer.id}] scorer failed on client ${sc.clientId}:`, err);
              scores[scorer.id] = { score: 0, reason: String(err) };
            }
          }
        }

        scenarioResults[sc.clientId] = {
          agent: sc.agentType,
          output: result.text,
          scores
        };
      } catch (e) {
        console.error(`  - FAILED scenario for ${sc.clientId}:`, e);
        const failScores: Record<string, any> = {};
        sc.scorers?.forEach(scorer => {
          failScores[scorer.id] = { score: 0, reason: "Agent Execution Failed: " + String(e) };
        });
        scenarioResults[sc.clientId] = {
          agent: sc.agentType,
          error: String(e),
          scores: failScores
        };
      }
    }));
  }

  // Aggregate results
  Object.values(scenarioResults).forEach((res: any) => {
    if (res.scores) {
      Object.entries(res.scores).forEach(([scorerId, scoreObj]: [string, any]) => {
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

  const overallScore = maxScore > 0 ? (totalScore / maxScore) : 0;
  console.log(`[Eval] Final Stats: totalScore=${totalScore}, maxScore=${maxScore}, overallScore=${overallScore}`);
  
  console.log(`\n========================================`);
  console.log(`Eval Suite Completed. Overall Score: ${(overallScore * 100).toFixed(1)}%`);
  console.log(`========================================`);

  await prisma.evalRun.create({
    data: {
      gitCommit: process.env.GITHUB_SHA || "local",
      overallScore,
      scenarioResults: scenarioResults as any,
      scorerBreakdown: scorerBreakdown as any
    }
  });

  if (overallScore < 0.8) {
    console.warn(`Eval score ${overallScore.toFixed(2)} is below threshold 0.80.`);
  }

  return { overallScore, scenarioResults, scorerBreakdown };
}

// Allow running directly if executed via npx tsx or similar
const isMain = process.argv[1]?.endsWith('run.ts');
if (isMain) {
  const args = process.argv.slice(2);
  const batchIdx = args.indexOf('--batch-size');
  const batchSize = batchIdx !== -1 ? parseInt(args[batchIdx + 1], 10) : 3;

  runAllEvals(batchSize).then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
