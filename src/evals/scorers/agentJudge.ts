import { z } from "zod";
import { env } from "@/lib/config";
import {
  isAbstentionVerdict,
  judgeVerdictSchema,
  softJudgeAllowsPromote,
  type JudgeVerdict,
} from "./judge-verdict";

/**
 * Agent-as-a-Judge process plan (SOTA P2.5 watch).
 * Planner only by default — never a canary-ci / promote gate.
 */

export const agentJudgeStepSchema = z.enum([
  "check_tools",
  "check_policy",
  "verdict",
]);

export type AgentJudgeStep = z.infer<typeof agentJudgeStepSchema>;

export const agentJudgeTraceSchema = z.object({
  scenarioId: z.string().min(1).optional(),
  toolNames: z.array(z.string()).default([]),
  policyVersion: z.string().min(1).optional(),
  reasoningExcerpt: z.string().max(4000).optional(),
});

export type AgentJudgeTrace = z.input<typeof agentJudgeTraceSchema>;

export const agentJudgePlanSchema = z.object({
  steps: z.array(agentJudgeStepSchema).min(1),
  enabled: z.boolean(),
});

export type AgentJudgePlan = z.infer<typeof agentJudgePlanSchema>;

export const agentJudgeResultSchema = z.object({
  status: z.enum(["skipped", "abstained", "scored"]),
  plan: agentJudgePlanSchema,
  verdict: judgeVerdictSchema.nullable(),
  reason: z.string().min(1),
});

export type AgentJudgeResult = z.infer<typeof agentJudgeResultSchema>;

/**
 * True when Agent-as-a-Judge is enabled via config (default false).
 */
export function isAgentAsJudgeEnabled(): boolean {
  return env.AGENT_AS_JUDGE;
}

/**
 * Builds a deterministic process-judge plan for an ambiguous compliance trace.
 * Does not call a model.
 */
export function createAgentJudgePlan(trace: AgentJudgeTrace): AgentJudgePlan {
  agentJudgeTraceSchema.parse(trace);
  return agentJudgePlanSchema.parse({
    steps: ["check_tools", "check_policy", "verdict"],
    enabled: isAgentAsJudgeEnabled(),
  });
}

/**
 * Runs Agent-as-a-Judge. Flag-off → skipped abstention.
 * Without an injected model override, never calls OpenRouter (unit CI stays $0).
 * REGULATORY: result must not be the sole promote gate — use softJudgeAllowsPromote only as advisory.
 */
export async function runAgentJudge(
  trace: AgentJudgeTrace,
  options?: {
    /** Test-only: inject a verdict instead of calling a model. */
    verdictOverride?: JudgeVerdict;
    /** Test-only: force enabled without mutating process.env. */
    enabledOverride?: boolean;
  },
): Promise<AgentJudgeResult> {
  agentJudgeTraceSchema.parse(trace);
  const enabled = options?.enabledOverride ?? isAgentAsJudgeEnabled();
  const plan = agentJudgePlanSchema.parse({
    steps: ["check_tools", "check_policy", "verdict"],
    enabled,
  });

  if (!plan.enabled) {
    const verdict: JudgeVerdict = {
      score: 0,
      verdict: "NEEDS_REVIEW",
      reason: "AGENT_AS_JUDGE=false — process judge skipped (watch-only)",
    };
    return agentJudgeResultSchema.parse({
      status: "skipped",
      plan,
      verdict,
      reason: verdict.reason,
    });
  }

  if (options?.verdictOverride) {
    const verdict = judgeVerdictSchema.parse(options.verdictOverride);
    return agentJudgeResultSchema.parse({
      status: isAbstentionVerdict(verdict) ? "abstained" : "scored",
      plan,
      verdict,
      reason: verdict.reason,
    });
  }

  // Live multi-step agent judge is TBD after calibration — abstain fail-closed.
  const verdict: JudgeVerdict = {
    score: 0,
    verdict: "unknown",
    reason:
      "Agent-as-a-Judge enabled but live multi-step runner is not configured; abstaining",
  };
  return agentJudgeResultSchema.parse({
    status: "abstained",
    plan,
    verdict,
    reason: verdict.reason,
  });
}

/**
 * Explicit guard: Agent-as-a-Judge alone must never authorize promote.
 */
export function agentJudgeAllowsPromote(result: AgentJudgeResult): boolean {
  if (result.status === "skipped" || result.status === "abstained") {
    return false;
  }
  return softJudgeAllowsPromote(result.verdict);
}
