import { createScorer } from "@mastra/core/evals";
import { generateText } from "ai";
import { getModel } from "@/lib/config";

function extractReasoningFromOutput(output: any): string {
  if (typeof output === "string") return output;
  if (output?.toolCalls && Array.isArray(output.toolCalls)) {
    for (const call of output.toolCalls) {
      if (call.name === "logAction" && call.args?.reasoning) {
        return call.args.reasoning;
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
  } catch (e) {
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
  } catch (e) {
    return `Failed to parse JSON from LLM: ${text}`;
  }
});
