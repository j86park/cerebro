import { prisma } from "@/lib/db/client";
import { invalidateAgent } from "@/lib/prompt-loader";
import {
  recordMutationPromoted,
  recordMutationRejected,
} from "@/lib/mutation-circuit";
import { taxonomyReportSchema, type TaxonomyReport } from "@/workflows/types";

type GateDecision =
  | "promoted"
  | "rejected_canary"
  | "rejected_regression"
  | "rejected_no_improvement";

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

  let decision: GateDecision = "promoted";
  if (best.canaryDelta < 0) {
    decision = "rejected_canary";
  } else if (best.corpusDelta < 0) {
    decision = "rejected_regression";
  } else if (best.targetDelta <= 0) {
    decision = "rejected_no_improvement";
  }

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

    await prisma.$transaction([
      prisma.promptVersion.updateMany({
        where: { agentId: job.agentId, isActive: true },
        data: { isActive: false },
      }),
      prisma.promptVersion.update({
        where: { id: best.candidateVersionId },
        data: { isActive: true },
      }),
    ]);
    invalidateAgent(job.agentId);

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
