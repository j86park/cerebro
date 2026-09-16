import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { VaultService } from "@/lib/db/vault-service";
import { env } from "@/lib/config";
import { applyHitlDecision, parseHitlContext } from "@/lib/hitl/applyDecision";
import {
  COMPLIANCE_HITL_SUSPEND_STEP_ID,
  COMPLIANCE_HITL_WORKFLOW_ID,
  hitlDecisionSchema,
} from "@/lib/hitl/schemas";

const hitlInputSchema = z.object({
  clientId: z.string().min(1),
  openKey: z.string().min(1),
  workflowRunId: z.string().min(1),
  toolName: z.string().min(1),
  actionType: z.string().min(1),
  stage: z.number().int().min(0),
  reasoning: z.string().min(1),
  policyVersion: z.string().min(1),
  documentId: z.string().optional(),
});

const hitlResumeSchema = z.object({
  decision: hitlDecisionSchema,
  editedReasoning: z.string().min(1).optional(),
  advisorId: z.string().min(1).optional(),
});

const hitlSuspendSchema = z.object({
  reason: z.string(),
  openKey: z.string(),
  toolName: z.string(),
  stage: z.number(),
  workflowRunId: z.string(),
});

const hitlOutputSchema = z.object({
  decision: hitlDecisionSchema,
  outcome: z.string(),
  dryRun: z.boolean(),
  emailSent: z.literal(false),
});

/**
 * Suspends until an advisor (or timeout job) resumes with an explicit decision.
 * REGULATORY: absence of resumeData means wait — never treat as approve.
 */
const awaitAdvisorDecision = createStep({
  id: COMPLIANCE_HITL_SUSPEND_STEP_ID,
  inputSchema: hitlInputSchema,
  outputSchema: hitlOutputSchema,
  resumeSchema: hitlResumeSchema,
  suspendSchema: hitlSuspendSchema,
  execute: async ({ inputData, resumeData, suspend }) => {
    if (!resumeData) {
      return await suspend({
        reason: `Advisor approval required for ${inputData.toolName} at stage ${inputData.stage}`,
        openKey: inputData.openKey,
        toolName: inputData.toolName,
        stage: inputData.stage,
        workflowRunId: inputData.workflowRunId,
      });
    }

    const vault = new VaultService({ clientId: inputData.clientId });
    const row = await vault.getEscalationStateByOpenKey(inputData.openKey);

    if (!row || typeof row !== "object") {
      // Idempotent resume after prior resolve (worker restart / duplicate job).
      return {
        decision: resumeData.decision,
        outcome: "HITL_ALREADY_RESOLVED",
        dryRun: env.DRY_RUN,
        emailSent: false as const,
      };
    }

    const context =
      "hitlContext" in row && (row as { hitlContext: unknown }).hitlContext != null
        ? parseHitlContext((row as { hitlContext: unknown }).hitlContext)
        : {
            workflowId: COMPLIANCE_HITL_WORKFLOW_ID,
            workflowRunId: inputData.workflowRunId,
            suspendStepId: COMPLIANCE_HITL_SUSPEND_STEP_ID,
            toolName: inputData.toolName,
            actionType: inputData.actionType,
            agentType: "COMPLIANCE" as const,
            stage: inputData.stage,
            reasoning: inputData.reasoning,
            policyVersion: inputData.policyVersion,
            documentId: inputData.documentId,
            openKey: inputData.openKey,
          };

    const applied = await applyHitlDecision({
      vault,
      context,
      decision: resumeData.decision,
      editedReasoning: resumeData.editedReasoning,
      advisorId: resumeData.advisorId,
    });

    return {
      decision: applied.decision,
      outcome: applied.outcome,
      dryRun: applied.dryRun,
      emailSent: false as const,
    };
  },
});

/**
 * Durable compliance HITL workflow: suspend for advisor approve/edit/deny; timeout → SAFE_HOLD.
 */
export const complianceHitlApprovalWorkflow = createWorkflow({
  id: COMPLIANCE_HITL_WORKFLOW_ID,
  inputSchema: hitlInputSchema,
  outputSchema: hitlOutputSchema,
})
  .then(awaitAdvisorDecision)
  .commit();
