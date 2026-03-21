import { createScorer } from "@mastra/core/evals";
import { generateText } from "ai";
import { getModel } from "@/lib/config";

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

export const reasoningQualityScorer = createScorer({
  id: "reasoningQualityScorer",
  description: "Assesses whether the agent's logged reasoning is specific, accurate, and regulatory-aware.",
})
.generateScore(async ({ run }) => {
  const reasoning = extractReasoningFromOutput(run.output);
  if (reasoning === "No reasoning explicitly logged.") return 0.0;

  const { text } = await generateText({
    model: getModel("evalJudge"),
    prompt: `
You are evaluating compliance agent reasoning quality.

Reasoning to evaluate:
"${reasoning}"

Score from 0.0 to 1.0 based on:
- Is it specific to this client's situation? (not generic)
- Does it reference the correct regulatory requirement?
- Does it correctly identify the urgency level?
- Does it explain why this action and not another?

Respond with JSON only: { "score": 0.0-1.0, "reason": "brief explanation" }
`,
  });

  try {
    const parsed = JSON.parse(text);
    return parsed.score ?? 0.0;
  } catch {
    return 0.0;
  }
})
.generateReason(async ({ run }) => {
  const reasoning = extractReasoningFromOutput(run.output);
  if (reasoning === "No reasoning explicitly logged.") return "No reasoning explicitly logged in output.";

  const { text } = await generateText({
    model: getModel("evalJudge"),
    prompt: `
You are evaluating compliance agent reasoning quality.

Reasoning to evaluate:
"${reasoning}"

Score from 0.0 to 1.0 based on:
- Is it specific to this client's situation? (not generic)
- Does it reference the correct regulatory requirement?
- Does it correctly identify the urgency level?
- Does it explain why this action and not another?

Respond with JSON only: { "score": 0.0-1.0, "reason": "brief explanation" }
`,
  });

  try {
    const parsed = JSON.parse(text);
    return parsed.reason ?? "LLM evaluation succeeded but returned no explicit reason.";
  } catch {
    return `Failed to parse JSON from LLM: ${text}`;
  }
});
