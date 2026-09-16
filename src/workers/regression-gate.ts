import { prisma } from "@/lib/db/client";
import { invalidateAgent } from "@/lib/prompt-loader";
import {
  recordMutationPromoted,
  recordMutationRejected,
} from "@/lib/mutation-circuit";
import { setEnvironmentPointer } from "@/lib/prompt-ops";
import { taxonomyReportSchema, type TaxonomyReport } from "@/workflows/types";
import { z } from "zod";

export type GateDecision =
  | "promoted"
  | "rejected_canary"
  | "rejected_pass_k"
  | "rejected_regression"
  | "rejected_no_improvement";

const shadowBreakdownSchema = z
  .object({
    canaryPassK: z.boolean().optional(),
    passK: z.number().int().optional(),
  })
  .passthrough();

export type ShadowGateInputs = {
  canaryDelta: number;
  corpusDelta: number;
  targetDelta: number;
  /** From scoreBreakdown — must be true to promote (fail closed if missing). */
  canaryPassK?: boolean;
};

/**
 * Pure promotion decision for mutation shadow results.
 * REGULATORY: canary regression or failed `pass^k` blocks promote.
 */
export function decideShadowGate(input: ShadowGateInputs): GateDecision {
  // Fail closed: missing canaryPassK means the shadow runner did not prove reliability.
  if (input.canaryPassK !== true) {
    return "rejected_pass_k";
  }
  if (input.canaryDelta < 0) {
    return "rejected_canary";
  }
  if (input.corpusDelta < 0) {
    return "rejected_regression";
  }
  if (input.targetDelta <= 0) {
    return "rejected_no_improvement";
  }
  return "promoted";
}

function readCanaryPassK(scoreBreakdown: unknown): boolean | undefined {
  const parsed = shadowBreakdownSchema.safeParse(scoreBreakdown);
  if (!parsed.success) return undefined;
  return parsed.data.canaryPassK;
}

/**
 * After all shadow runs for a mutation job complete, picks the best candidate and applies promote / reject rules.
 */
export async function evaluateGate(mutationJobId: string): Promise<void> {
  const job = await prisma.promptMutationJob.findUniqueOrThrow({
    where: { id: mutationJobId },
    include: { shadowRunResults: true },
  });

  if (job.status === "promoted" || job.status === "rejected" || job.status === "failed") {
    return;
  }

  const pending = job.shadowRunResults.filter((r) => r.gateDecision === "pending");
  if (pending.length < job.expectedShadowRuns) {
    return;
  }
  if (pending.length !== job.expectedShadowRuns) {
    return;
  }

  const best = pending.reduce((a, b) => (a.overallDelta >= b.overallDelta ? a : b));

  const decision = decideShadowGate({
    canaryDelta: best.canaryDelta,
    corpusDelta: best.corpusDelta,
    targetDelta: best.targetDelta,
    canaryPassK: readCanaryPassK(best.scoreBreakdown),
  });

  const finalLabel = decision === "promoted" ? "promoted" : decision;

  await prisma.$transaction(
    job.shadowRunResults.map((r) =>
      prisma.shadowRunResult.update({
        where: { id: r.id },
        data: {
          gateDecision: r.id === best.id ? finalLabel : "superseded",
        },
      })
    )
  );

  const taxonomyParse = taxonomyReportSchema.safeParse(job.taxonomy);
  const fallbackAgentId =
    job.agentId === "onboarding" ? ("onboarding" as const) : ("compliance" as const);
  const taxonomy: TaxonomyReport = taxonomyParse.success
    ? taxonomyParse.data
    : {
        agentId: fallbackAgentId,
        evalRunId: job.triggerEvalRunId,
        findings: [],
        dominantFailureType: "tool_selection",
        recommendedMutation: "",
      };

  if (decision === "promoted") {
    if (!best.candidateVersionId) {
      throw new Error("evaluateGate: promoted run missing candidateVersionId");
    }

    // REGULATORY: mutation gate promotes to STAGING only — never unsupervised production.
    await setEnvironmentPointer({
      agentId: job.agentId === "onboarding" ? "onboarding" : "compliance",
      environment: "STAGING",
      promptVersionId: best.candidateVersionId,
    });
    // Keep runtime on production `isActive`; staging pointer holds the candidate for human promote.
    invalidateAgent(job.agentId);

    // REGULATORY: lessons are append-only creates — never update/delete existing lesson text.
    for (const f of taxonomy.findings) {
      await prisma.promptLesson.create({
        data: {
          agentId: taxonomy.agentId,
          failureType: f.failureType,
          triggerPattern: f.triggerPattern,
          lessonText: f.proposedInstruction,
          passedGate: true,
          sourceJobId: job.id,
        },
      });
    }

    await prisma.promptMutationJob.update({
      where: { id: job.id },
      data: {
        status: "promoted",
        consecutiveFailures: 0,
        candidateVersionId: best.candidateVersionId,
      },
    });
    await recordMutationPromoted();
  } else {
    await prisma.promptMutationJob.update({
      where: { id: job.id },
      data: {
        status: "rejected",
        consecutiveFailures: { increment: 1 },
      },
    });
    await recordMutationRejected();
  }
}
