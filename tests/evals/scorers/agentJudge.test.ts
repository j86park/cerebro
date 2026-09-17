import { describe, expect, it } from "vitest";
import { AGENT_JUDGE_SCORER_ID, softScorersForMode } from "@/evals/scorer-selection";
import {
  agentJudgeAllowsPromote,
  createAgentJudgePlan,
  isAgentAsJudgeEnabled,
  runAgentJudge,
} from "@/evals/scorers/agentJudge";
import { softJudgeAllowsPromote } from "@/evals/scorers/judge-verdict";

describe("agentJudge (SOTA P2.5 watch)", () => {
  it("defaults disabled", () => {
    expect(isAgentAsJudgeEnabled()).toBe(false);
  });

  it("plan has check_tools → check_policy → verdict", () => {
    const plan = createAgentJudgePlan({
      scenarioId: "CLT-003",
      toolNames: ["sendClientReminder"],
    });
    expect(plan.steps).toEqual(["check_tools", "check_policy", "verdict"]);
    expect(plan.enabled).toBe(false);
  });

  it("flag-off run abstains / skips without OpenRouter", async () => {
    const result = await runAgentJudge({
      toolNames: ["escalateToComplianceOfficer"],
      reasoningExcerpt: "thin evidence",
    });
    expect(result.status).toBe("skipped");
    expect(result.verdict?.verdict).toBe("NEEDS_REVIEW");
    expect(agentJudgeAllowsPromote(result)).toBe(false);
    expect(softJudgeAllowsPromote(result.verdict)).toBe(false);
  });

  it("injected pass still must not be sole CI gate; soft promote is advisory only", async () => {
    const result = await runAgentJudge(
      { toolNames: ["logAction"] },
      {
        enabledOverride: true,
        verdictOverride: {
          score: 1,
          verdict: "pass",
          reason: "injected for unit test",
        },
      },
    );
    expect(result.status).toBe("scored");
    expect(agentJudgeAllowsPromote(result)).toBe(true);
    // Ship path remains hard scorers — agent judge is not in canary soft list.
    expect(softScorersForMode("canary-ci")).toHaveLength(0);
  });

  it("enabled without runner abstains (no OpenRouter)", async () => {
    const result = await runAgentJudge(
      { toolNames: ["sendClientReminder"] },
      { enabledOverride: true },
    );
    expect(result.status).toBe("abstained");
    expect(agentJudgeAllowsPromote(result)).toBe(false);
  });

  it("is not attached under canary-ci soft scorers", () => {
    const soft = softScorersForMode("canary-ci");
    expect(soft).toHaveLength(0);
    expect(AGENT_JUDGE_SCORER_ID).toBe("agentJudge");
  });
});
