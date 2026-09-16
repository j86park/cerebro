import { createScorer } from "@mastra/core/evals";
import { generateText } from "ai";
import { getModel } from "@/lib/config";
import {
  parseJudgeVerdict,
  scoreFromJudgeVerdict,
  type JudgeVerdict,
} from "./judge-verdict";

function extractReasoningFromOutput(output: unknown): string {
  if (typeof output === "string") return output;
  if (typeof output !== "object" || output === null) {
    return "No reasoning explicitly logged.";
  }
  const rec = output as Record<string, unknown>;
  const toolCalls = rec.toolCalls;
  if (!Array.isArray(toolCalls)) return "No reasoning explicitly logged.";
  for (const call of toolCalls) {
    if (typeof call !== "object" || call === null) continue;
    const c = call as Record<string, unknown>;
    if (c.name === "logAction") {
      const args = c.args;
      if (typeof args === "object" && args !== null) {
        const a = args as Record<string, unknown>;
        if (typeof a.reasoning === "string") return a.reasoning;
      }
    }
  }
  return "No reasoning explicitly logged.";
}

function buildJudgePrompt(reasoning: string): string {
  return `
You are evaluating compliance agent reasoning quality.

Reasoning to evaluate:
"${reasoning}"

Score from 0.0 to 1.0 based on:
- Is it specific to this client's situation? (not generic)
- Does it reference the correct regulatory requirement?
- Does it correctly identify the urgency level?
- Does it explain why this action and not another?

Verdict rules:
- "pass" — evidence is sufficient and reasoning quality is acceptable
- "fail" — evidence is sufficient but reasoning is wrong or inadequate
- "unknown" — evidence is too thin to judge; do not invent confidence
- "NEEDS_REVIEW" — ambiguous case that requires human review; do not silently pass

Respond with JSON only:
{ "score": 0.0-1.0, "verdict": "pass" | "fail" | "unknown" | "NEEDS_REVIEW", "reason": "brief explanation" }
`.trim();
}

/**
 * Invokes the pinned evalJudge model and returns a structured verdict.
 * Always uses `getModel("evalJudge")` — never a hardcoded model id.
 */
export async function judgeReasoningQuality(reasoning: string): Promise<JudgeVerdict | null> {
  const { text } = await generateText({
    model: getModel("evalJudge"),
    prompt: buildJudgePrompt(reasoning),
  });
  return parseJudgeVerdict(text);
}

export const reasoningQualityScorer = createScorer({
  id: "reasoningQualityScorer",
  description:
    "Assesses whether the agent's logged reasoning is specific, accurate, and regulatory-aware. Soft scorer — cannot override canary hard gates.",
})
  .generateScore(async ({ run }) => {
    const reasoning = extractReasoningFromOutput(run.output);
    if (reasoning === "No reasoning explicitly logged.") return 0.0;

    const verdict = await judgeReasoningQuality(reasoning);
    if (!verdict) return 0.0;
    return scoreFromJudgeVerdict(verdict);
  })
  .generateReason(async ({ run }) => {
    const reasoning = extractReasoningFromOutput(run.output);
    if (reasoning === "No reasoning explicitly logged.") {
      return "No reasoning explicitly logged in output.";
    }

    const verdict = await judgeReasoningQuality(reasoning);
    if (!verdict) {
      return "Failed to parse structured judge verdict (unknown / NEEDS_REVIEW forced non-pass).";
    }
    if (verdict.verdict === "unknown" || verdict.verdict === "NEEDS_REVIEW") {
      return `Judge verdict ${verdict.verdict}: ${verdict.reason}`;
    }
    return verdict.reason;
  });
