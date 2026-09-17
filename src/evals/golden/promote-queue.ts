import { z } from "zod";
import { env } from "@/lib/config";
import type { JudgeVerdict } from "@/evals/scorers/judge-verdict";
import {
  isAbstentionVerdict,
  softJudgeAllowsPromote,
} from "@/evals/scorers/judge-verdict";
import type { OnlineSampleStream } from "@/lib/evals/online-judge-sample";
import { exportSyntheticFailureCandidate } from "./export-failure";
import { writeFailureCandidate } from "./promote";
import type { GoldenRoots } from "./paths";

const stageFromOnlineInputSchema = z.object({
  clientId: z.string().min(1),
  agentType: z.enum(["COMPLIANCE", "ONBOARDING"]),
  sourceJobId: z.string().min(1),
  toolNames: z.array(z.string()).default([]),
  stream: z.enum(["uniform", "failure_weighted"]),
  isFailureSignal: z.boolean().default(false),
  reasoningPreview: z.string().optional(),
  /** Soft judge verdict when live; null under DRY_RUN / parse miss. */
  verdict: z
    .object({
      score: z.number(),
      verdict: z.enum(["pass", "fail", "unknown", "NEEDS_REVIEW"]),
      reason: z.string(),
    })
    .nullable()
    .optional(),
  roots: z.custom<GoldenRoots>().optional(),
});

export type StagePromoteCandidateInput = z.infer<
  typeof stageFromOnlineInputSchema
>;

export type StagePromoteCandidateResult =
  | { staged: false; reason: "not_promote_candidate" }
  | { staged: true; candidateId: string; filePath: string };

/**
 * Whether an online sample should enter the human promote queue.
 * Failure-weighted stream always stages; uniform only on soft fail / abstention.
 * Soft pass never auto-promotes — staging is queue-only.
 */
export function shouldStagePromoteCandidate(input: {
  stream: OnlineSampleStream;
  isFailureSignal?: boolean;
  verdict?: JudgeVerdict | null;
}): boolean {
  if (input.stream === "failure_weighted" || input.isFailureSignal === true) {
    return true;
  }
  const verdict = input.verdict ?? null;
  if (!verdict) {
    // Uniform + no verdict (DRY_RUN): skip staging — avoid flooding queue.
    return false;
  }
  if (isAbstentionVerdict(verdict)) return true;
  if (!softJudgeAllowsPromote(verdict)) return true;
  return false;
}

/**
 * Stages a pending failure→golden candidate from an online sample.
 * Always writes candidates/ (audit staging); never touches approved/ ship gate.
 * REGULATORY: human approve + regulatoryConfirmed required before hard-gate membership.
 */
export async function stagePromoteCandidateFromOnlineSample(
  input: StagePromoteCandidateInput,
): Promise<StagePromoteCandidateResult> {
  const parsed = stageFromOnlineInputSchema.parse(input);
  if (
    !shouldStagePromoteCandidate({
      stream: parsed.stream,
      isFailureSignal: parsed.isFailureSignal,
      verdict: parsed.verdict ?? null,
    })
  ) {
    return { staged: false, reason: "not_promote_candidate" };
  }

  const safeJob = parsed.sourceJobId
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 48);
  const candidateId = `cand-oj-${safeJob}-${parsed.clientId}`;
  const tools =
    parsed.toolNames.length > 0
      ? parsed.toolNames
      : ["unknownToolFromOnlineSample"];

  const candidate = exportSyntheticFailureCandidate({
    candidateId,
    clientId: parsed.clientId,
    agentType: parsed.agentType,
    observedToolNames: tools,
    scores: {
      onlineJudge: {
        score: parsed.verdict?.score ?? 0,
        reason:
          parsed.verdict?.reason ??
          (parsed.stream === "failure_weighted"
            ? "Failure-weighted online sample (pending human review)"
            : "Online sample staged without live verdict"),
      },
    },
    notes: [
      `Online dual-stream sample (${parsed.stream})`,
      parsed.isFailureSignal ? "failure_signal=true" : null,
      parsed.verdict
        ? `verdict=${parsed.verdict.verdict}`
        : `DRY_RUN=${env.DRY_RUN}`,
      parsed.reasoningPreview
        ? `preview=${parsed.reasoningPreview.slice(0, 120)}`
        : null,
    ]
      .filter(Boolean)
      .join("; "),
  });

  const filePath = await writeFailureCandidate(candidate, parsed.roots);
  return { staged: true, candidateId, filePath };
}
