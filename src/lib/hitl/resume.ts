import { z } from "zod";
import type { VaultService } from "@/lib/db/vault-service";
import {
  COMPLIANCE_HITL_SUSPEND_STEP_ID,
  COMPLIANCE_HITL_WORKFLOW_ID,
  hitlDecisionSchema,
  type HitlDecision,
} from "./schemas";
import { applyHitlDecision, parseHitlContext } from "./applyDecision";

type ResumeWorkflowFn = (input: {
  workflowRunId: string;
  decision: HitlDecision;
  editedReasoning?: string;
  advisorId?: string;
}) => Promise<unknown>;

/**
 * Resumes a suspended compliance HITL Mastra workflow with an advisor/timeout decision.
 */
export async function resumeHitlWorkflow(input: {
  clientId: string;
  workflowRunId: string;
  decision: HitlDecision;
  editedReasoning?: string;
  advisorId?: string;
  resumeWorkflow?: ResumeWorkflowFn;
}): Promise<unknown> {
  const parsed = z
    .object({
      clientId: z.string().min(1),
      workflowRunId: z.string().min(1),
      decision: hitlDecisionSchema,
      editedReasoning: z.string().min(1).optional(),
      advisorId: z.string().min(1).optional(),
    })
    .parse(input);

  const resumeWorkflow =
    input.resumeWorkflow ??
    (async ({ workflowRunId, decision, editedReasoning, advisorId }) => {
      const { getCerebro } = await import("@/agents/mastra");
      const cerebro = await getCerebro();
      const workflow = cerebro.getWorkflow(COMPLIANCE_HITL_WORKFLOW_ID);
      const run = await workflow.createRun({ runId: workflowRunId });
      return run.resume({
        step: COMPLIANCE_HITL_SUSPEND_STEP_ID,
        resumeData: {
          decision,
          editedReasoning,
          advisorId,
        },
      });
    });

  return resumeWorkflow({
    workflowRunId: parsed.workflowRunId,
    decision: parsed.decision,
    editedReasoning: parsed.editedReasoning,
    advisorId: parsed.advisorId,
  });
}

/**
 * Applies the advisor/timeout decision via VaultService (examiner SoR), then best-effort
 * resumes the Mastra snapshot so workers never block on multi-day waits.
 * Survives worker kill/restart: EscalationState.hitlContext is sufficient to re-apply.
 */
export async function processHitlResumeFromEscalation(input: {
  vault: VaultService;
  clientId: string;
  openKey: string;
  decision: HitlDecision;
  editedReasoning?: string;
  advisorId?: string;
  resumeWorkflow?: ResumeWorkflowFn;
}): Promise<{
  decision: HitlDecision;
  outcome: string;
  workflowRunId: string;
}> {
  const parsed = z
    .object({
      clientId: z.string().min(1),
      openKey: z.string().min(1),
      decision: hitlDecisionSchema,
      editedReasoning: z.string().min(1).optional(),
      advisorId: z.string().min(1).optional(),
    })
    .parse({
      clientId: input.clientId,
      openKey: input.openKey,
      decision: input.decision,
      editedReasoning: input.editedReasoning,
      advisorId: input.advisorId,
    });

  const row = await input.vault.getEscalationStateByOpenKey(parsed.openKey);
  if (!row || typeof row !== "object" || !("hitlContext" in row)) {
    throw new Error(
      `No pending HITL escalation openKey=${parsed.openKey} for client ${parsed.clientId}`,
    );
  }

  const status = (row as { status?: string }).status;
  if (status !== "PENDING_APPROVAL" && status !== "SAFE_HOLD") {
    throw new Error(
      `Escalation openKey=${parsed.openKey} is not resumable (status=${status ?? "unknown"})`,
    );
  }

  // Timeout jobs may race an already-timed-out hold.
  if (parsed.decision === "timeout" && status === "SAFE_HOLD") {
    return {
      decision: "timeout",
      outcome: "HITL_TIMEOUT_SAFE_HOLD",
      workflowRunId: parseHitlContext((row as { hitlContext: unknown }).hitlContext)
        .workflowRunId,
    };
  }

  if (status !== "PENDING_APPROVAL" && parsed.decision !== "timeout") {
    throw new Error(
      `Escalation openKey=${parsed.openKey} is not pending approval (status=${status})`,
    );
  }

  const context = parseHitlContext((row as { hitlContext: unknown }).hitlContext);

  // SoR write first — durable across worker restart even if Mastra snapshot is unavailable.
  const applied = await applyHitlDecision({
    vault: input.vault,
    context,
    decision: parsed.decision,
    editedReasoning: parsed.editedReasoning,
    advisorId: parsed.advisorId,
  });

  try {
    await resumeHitlWorkflow({
      clientId: parsed.clientId,
      workflowRunId: context.workflowRunId,
      decision: parsed.decision,
      editedReasoning: parsed.editedReasoning,
      advisorId: parsed.advisorId,
      resumeWorkflow: input.resumeWorkflow,
    });
  } catch (error) {
    console.warn(
      `[HITL] Mastra resume best-effort failed for run=${context.workflowRunId} (SoR decision already applied):`,
      error instanceof Error ? error.message : error,
    );
  }

  return {
    decision: applied.decision,
    outcome: applied.outcome,
    workflowRunId: context.workflowRunId,
  };
}

/**
 * Enqueues advisor approve/deny/edit onto the priority queue (API path — no Mastra in routes).
 */
export async function enqueueAdvisorDecision(input: {
  clientId: string;
  openKey: string;
  workflowRunId: string;
  decision: Exclude<HitlDecision, "timeout">;
  editedReasoning?: string;
  advisorId?: string;
}): Promise<{ jobId: string; deduplicated: boolean }> {
  const { queues } = await import("@/lib/queue/client");
  const { enqueueHitlResumeJob } = await import("./enqueue");
  return enqueueHitlResumeJob(queues.priority as never, {
    kind: "hitl_resume",
    clientId: input.clientId,
    openKey: input.openKey,
    workflowRunId: input.workflowRunId,
    workflowId: COMPLIANCE_HITL_WORKFLOW_ID,
    decision: input.decision,
    editedReasoning: input.editedReasoning,
    advisorId: input.advisorId,
  });
}
