import { z } from "zod";

/**
 * Structured LLM-judge verdict for soft scorers.
 * `unknown` / `NEEDS_REVIEW` are escape hatches when evidence is thin —
 * they must not silently pass.
 */
export const judgeVerdictSchema = z.object({
  score: z.number().min(0).max(1),
  verdict: z.enum(["pass", "fail", "unknown", "NEEDS_REVIEW"]),
  reason: z.string().min(1),
});

export type JudgeVerdict = z.infer<typeof judgeVerdictSchema>;

/**
 * Maps a parsed judge verdict to a numeric soft score.
 * Thin evidence (`unknown` / `NEEDS_REVIEW`) never silently passes.
 */
export function scoreFromJudgeVerdict(verdict: JudgeVerdict): number {
  if (verdict.verdict === "unknown" || verdict.verdict === "NEEDS_REVIEW") {
    return 0;
  }
  return verdict.score;
}

/**
 * Parses raw judge JSON text into a validated verdict, or null on failure.
 */
export function parseJudgeVerdict(text: string): JudgeVerdict | null {
  const trimmed = text.trim();
  // Models sometimes wrap JSON in fences; strip a single fenced block if present.
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const payload = fenced?.[1] ?? trimmed;

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    // Attempt to extract the first JSON object substring.
    const start = payload.indexOf("{");
    const end = payload.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      parsed = JSON.parse(payload.slice(start, end + 1));
    } catch {
      return null;
    }
  }

  const result = judgeVerdictSchema.safeParse(parsed);
  return result.success ? result.data : null;
}
