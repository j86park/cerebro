import { createScorer } from "@mastra/core/evals";
import { generateText } from "ai";
import {
  getEvalJudgeEscalateModel,
  getModel,
  isEvalJudgeCascadeEnabled,
} from "@/lib/config";
import {
  buildJudgeCacheKey,
  getCachedJudgeVerdict,
  reasoningQualityCacheKeyParts,
  setCachedJudgeVerdict,
} from "@/evals/judge-cache";
import {
  recordCascadeEscalation,
  shouldEscalateJudgeVerdict,
} from "@/evals/judge-routing";
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

/**
 * Builds the pinned soft-judge prompt. Bump `REASONING_QUALITY_RUBRIC_VERSION`
 * in `judge-cache.ts` when this text or verdict semantics change.
 */
export function buildJudgePrompt(reasoning: string): string {
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

/** In-flight dedupe so generateScore + generateReason share one LLM call. */
const inFlightJudgments = new Map<string, Promise<JudgeVerdict | null>>();

async function invokeJudgeModel(
  reasoning: string,
  model: ReturnType<typeof getModel>
): Promise<JudgeVerdict | null> {
  const { text } = await generateText({
    model,
    prompt: buildJudgePrompt(reasoning),
  });
  return parseJudgeVerdict(text);
}

/**
 * Invokes the pinned evalJudge model (with exact cache + optional cascade Pilot).
 * Always uses `getModel("evalJudge")` — never a hardcoded model id.
 * AUT remains `getModel("dev")` elsewhere; this path is judge-only.
 */
export async function judgeReasoningQuality(
  reasoning: string,
  options?: {
    scenarioId?: string;
    toolsHash?: string;
    liveSessionId?: string;
  }
): Promise<JudgeVerdict | null> {
  const keyParts = reasoningQualityCacheKeyParts({
    reasoning,
    scenarioId: options?.scenarioId,
    toolsHash: options?.toolsHash,
  });
  const cacheKey = buildJudgeCacheKey(keyParts);

  const cached = getCachedJudgeVerdict(cacheKey);
  if (cached) return cached.verdict;

  const existing = inFlightJudgments.get(cacheKey);
  if (existing) return existing;

  const pending = (async (): Promise<JudgeVerdict | null> => {
    let verdict = await invokeJudgeModel(reasoning, getModel("evalJudge"));

    if (shouldEscalateJudgeVerdict(verdict) && isEvalJudgeCascadeEnabled()) {
      const escalateModel = getEvalJudgeEscalateModel(options?.liveSessionId);
      if (escalateModel) {
        recordCascadeEscalation();
        const escalated = await invokeJudgeModel(reasoning, escalateModel);
        if (escalated) verdict = escalated;
      }
    }

    if (verdict) {
      setCachedJudgeVerdict(cacheKey, verdict);
    }
    return verdict;
  })();

  inFlightJudgments.set(cacheKey, pending);
  try {
    return await pending;
  } finally {
    inFlightJudgments.delete(cacheKey);
  }
}

/**
 * Formats a soft-judge reason string from a verdict (shared by generateReason).
 */
export function reasonFromJudgeVerdict(verdict: JudgeVerdict | null): string {
  if (!verdict) {
    return "Failed to parse structured judge verdict (unknown / NEEDS_REVIEW forced non-pass).";
  }
  if (verdict.verdict === "unknown" || verdict.verdict === "NEEDS_REVIEW") {
    return `Judge verdict ${verdict.verdict}: ${verdict.reason}`;
  }
  return verdict.reason;
}

export const reasoningQualityScorer = createScorer({
  id: "reasoningQualityScorer",
  description:
    "Assesses whether the agent's logged reasoning is specific, accurate, and regulatory-aware. Soft scorer — cannot override canary hard gates.",
})
  .generateScore(async ({ run }) => {
    const reasoning = extractReasoningFromOutput(run.output);
    if (reasoning === "No reasoning explicitly logged.") return 0.0;

    // Single shared call with generateReason via inFlight + exact cache (PR3).
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
    return reasonFromJudgeVerdict(verdict);
  });
