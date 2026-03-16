import { complianceScenarios } from "./scenarios/compliance.eval";
import { onboardingScenarios } from "./scenarios/onboarding.eval";
import { complianceAgent } from "@/agents/compliance/agent";
import { onboardingAgent } from "@/agents/onboarding/agent";
import { VaultService } from "@/lib/db/vault-service";
import { buildSharedTools } from "@/tools/shared";
import { buildComplianceTools } from "@/tools/compliance";
import { buildOnboardingTools } from "@/tools/onboarding";
import { prisma } from "@/lib/db/client";

export async function runAllEvals() {
  console.log("Starting Evaluation Suite...");
  const scenarios = [...complianceScenarios, ...onboardingScenarios];
  const scenarioResults: Record<string, any> = {};
  const scorerBreakdown: Record<string, { total: number; passed: number }> = {};
  let totalScore = 0;
  let maxScore = 0;

  for (const sc of scenarios) {
    console.log(`\nEvaluating ${sc.agentType} scenario for client ${sc.clientId}...`);
    const vault = new VaultService({ clientId: sc.clientId });
    const sharedTools = buildSharedTools(vault);
    
    // Select agent and tools
    let agent, toolsets;
    if (sc.agentType === "COMPLIANCE") {
      agent = complianceAgent;
      toolsets = { shared: sharedTools, compliance: buildComplianceTools(vault) };
    } else {
      agent = onboardingAgent;
      toolsets = { shared: sharedTools, onboarding: buildOnboardingTools(vault) };
    }

    try {
      // Run the agent
      const result = await agent.generate(sc.input, {
        memory: { thread: sc.clientId, resource: sc.clientId },
        toolsets
      });

      const scores: Record<string, any> = {};

      // Run scorers
      for (const scorer of sc.scorers) {
        if (!scorerBreakdown[scorer.id]) {
          scorerBreakdown[scorer.id] = { total: 0, passed: 0 };
        }
        
        try {
          const scorerResult = await scorer.run({
            output: result,
            groundTruth: sc.expected
          });
          
          scores[scorer.id] = scorerResult;
          const scoreValue = (scorerResult.score as number) ?? 0;
          
          totalScore += scoreValue;
          maxScore += 1;
          scorerBreakdown[scorer.id].total += 1;
          if (scoreValue === 1.0) {
            scorerBreakdown[scorer.id].passed += 1;
          }

          console.log(`  - [${scorer.id}]: ${scoreValue} (${scorerResult.reason})`);
        } catch (err) {
          console.error(`  - [${scorer.id}]: FAILED on client ${sc.clientId}:`, err);
          scores[scorer.id] = { score: 0, reason: String(err) };
          maxScore += 1;
          scorerBreakdown[scorer.id].total += 1;
        }
      }

      scenarioResults[sc.clientId] = {
        agent: sc.agentType,
        output: result.text,
        scores
      };
    } catch (e) {
      console.error(`  - Agent run failed for ${sc.clientId}:`, e);
      scenarioResults[sc.clientId] = {
        agent: sc.agentType,
        error: String(e),
        scores: {}
      };
    }
  }

  const overallScore = maxScore > 0 ? (totalScore / maxScore) : 0;
  console.log(`\n========================================`);
  console.log(`Eval Suite Completed. Overall Score: ${(overallScore * 100).toFixed(1)}%`);
  console.log(`========================================`);

  await prisma.evalRun.create({
    data: {
      gitCommit: process.env.GITHUB_SHA || "local",
      overallScore,
      scenarioResults,
      scorerBreakdown
    }
  });

  if (overallScore < 0.8) {
    throw new Error(`Eval score ${overallScore.toFixed(2)} is below threshold 0.80. Check failing scenarios.`);
  }

  return { overallScore, scenarioResults, scorerBreakdown };
}

// Allow running directly if executed via vitest or runner
if (typeof require !== 'undefined' && require.main === module) {
  runAllEvals().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
