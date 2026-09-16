import { z } from "zod";
import type { VaultService } from "@/lib/db/vault-service";
import { EscalationStatus } from "@/lib/db/enums";
import {
  buildHitlOpenKey,
  COMPLIANCE_HITL_SUSPEND_STEP_ID,
  COMPLIANCE_HITL_WORKFLOW_ID,
  hitlContextSchema,
  type HitlContext,
} from "./schemas";

const beginHitlSuspendInputSchema = z.object({
  vault: z.custom<VaultService>((v) => v != null && typeof v === "object"),
  clientId: z.string().min(1),
  toolName: z.string().min(1),
  actionType: z.string().min(1),
  stage: z.number().int().min(0),
  reasoning: z.string().min(1),
  policyVersion: z.string().min(1),
  documentId: z.string().optional(),
});

type StartWorkflowFn = (payload: {
  clientId: string;
  toolName: string;
  actionType: string;
  stage: number;
  reasoning: string;
  policyVersion: string;
  documentId?: string;
  openKey: string;
}) => Promise<{ workflowRunId: string }>;

type ScheduleTimeoutFn = (payload: {
  clientId: string;
  workflowRunId: string;
  openKey: string;
}) => Promise<void>;

export type BeginHitlSuspendInput = z.infer<typeof beginHitlSuspendInputSchema> & {
  /** Injected in tests to avoid Mastra/Postgres. */
  startWorkflow?: StartWorkflowFn;
  /** Injected in tests to skip BullMQ. */
  scheduleTimeout?: ScheduleTimeoutFn;
};

export type BeginHitlSuspendResult = {
  workflowRunId: string;
  openKey: string;
  hitlContext: HitlContext;
  status: "suspended";
};

/**
 * Starts the compliance HITL workflow, persists EscalationState, and schedules timeout.
 * Releases the agent worker immediately — wait state lives in Mastra Postgres snapshots.
 */
export async function beginHitlSuspend(
  input: BeginHitlSuspendInput,
): Promise<BeginHitlSuspendResult> {
  const {
    startWorkflow: startWorkflowInject,
    scheduleTimeout: scheduleTimeoutInject,
    ...rest
  } = input;
  const parsed = beginHitlSuspendInputSchema.parse(rest);
  const openKey = buildHitlOpenKey(parsed.toolName, parsed.stage);

  const startWorkflow =
    startWorkflowInject ??
    (async (payload) => {
      // Dynamic import avoids circular init: mastra → agents → tools → hitl → mastra.
      const { getCerebro } = await import("@/agents/mastra");
      const cerebro = await getCerebro();
      const workflow = cerebro.getWorkflow(COMPLIANCE_HITL_WORKFLOW_ID);
      const run = await workflow.createRun();
      const result = await run.start({
        inputData: {
          clientId: payload.clientId,
          openKey: payload.openKey,
          workflowRunId: run.runId,
          toolName: payload.toolName,
          actionType: payload.actionType,
          stage: payload.stage,
          reasoning: payload.reasoning,
          policyVersion: payload.policyVersion,
          documentId: payload.documentId,
        },
      });

      if (result.status !== "suspended") {
        throw new Error(
          `Expected HITL workflow to suspend; got status=${result.status} ` +
            `for tool=${payload.toolName} client=${payload.clientId}`,
        );
      }

      return { workflowRunId: run.runId };
    });

  const { workflowRunId } = await startWorkflow({
    clientId: parsed.clientId,
    toolName: parsed.toolName,
    actionType: parsed.actionType,
    stage: parsed.stage,
    reasoning: parsed.reasoning,
    policyVersion: parsed.policyVersion,
    documentId: parsed.documentId,
    openKey,
  });

  const hitlContext = hitlContextSchema.parse({
    workflowId: COMPLIANCE_HITL_WORKFLOW_ID,
    workflowRunId,
    suspendStepId: COMPLIANCE_HITL_SUSPEND_STEP_ID,
    toolName: parsed.toolName,
    actionType: parsed.actionType,
    agentType: "COMPLIANCE",
    stage: parsed.stage,
    reasoning: parsed.reasoning,
    policyVersion: parsed.policyVersion,
    documentId: parsed.documentId,
    openKey,
  });

  await parsed.vault.upsertEscalationState({
    openKey,
    ladderStage: parsed.stage,
    status: EscalationStatus.PENDING_APPROVAL,
    documentId: parsed.documentId,
    policyVersion: parsed.policyVersion,
    reasonCodes: ["POLICY_REQUIRES_APPROVAL", "HITL_SUSPENDED"],
    hitlContext,
  });

  await parsed.vault.logAction({
    agentType: "COMPLIANCE",
    actionType: parsed.actionType,
    trigger: "SCHEDULED",
    reasoning: parsed.reasoning,
    outcome: "HITL_SUSPENDED",
    documentId: parsed.documentId,
    stage: parsed.stage,
    policyVersion: parsed.policyVersion,
    actor: "AGENT",
    reasonCodes: ["HITL_SUSPENDED", "POLICY_REQUIRES_APPROVAL"],
    citedFields: {
      workflowRunId,
      openKey,
      toolName: parsed.toolName,
      suspendStepId: COMPLIANCE_HITL_SUSPEND_STEP_ID,
    },
    idempotencyKey: `hitl-suspend:${workflowRunId}`,
  });

  const scheduleTimeout =
    scheduleTimeoutInject ??
    (async ({ clientId, workflowRunId: runId, openKey: key }) => {
      const { queues } = await import("@/lib/queue/client");
      const { enqueueHitlTimeoutJob } = await import("./enqueue");
      await enqueueHitlTimeoutJob(queues.priority as never, {
        kind: "hitl_timeout",
        clientId,
        workflowRunId: runId,
        workflowId: COMPLIANCE_HITL_WORKFLOW_ID,
        openKey: key,
      });
    });

  await scheduleTimeout({
    clientId: parsed.clientId,
    workflowRunId,
    openKey,
  });

  return {
    workflowRunId,
    openKey,
    hitlContext,
    status: "suspended",
  };
}
