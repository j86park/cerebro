import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { VaultService } from "@/lib/db/vault-service";

const inputSchema = z.object({
  agentType: z
    .enum(["COMPLIANCE", "ONBOARDING"])
    .describe("Which agent is logging this action"),
  actionType: z
    .enum([
      "SCAN_VAULT",
      "NOTIFY_ADVISOR",
      "SEND_CLIENT_REMINDER",
      "ESCALATE_COMPLIANCE",
      "ESCALATE_MANAGEMENT",
      "MARK_RESOLVED",
      "REQUEST_DOCUMENT",
      "VALIDATE_DOCUMENT",
      "ADVANCE_STAGE",
      "COMPLETE_ONBOARDING",
      "ALERT_ADVISOR_STUCK",
    ])
    .describe("The type of action being logged"),
  trigger: z
    .enum([
      "SCHEDULED",
      "EVENT_UPLOAD",
      "MANUAL",
      "SIMULATION",
      "EVENT_EXPIRY_PROXIMITY",
      "EVENT_RISK_TIER_CHANGE",
      "EVENT_PROFILE_MATERIAL_CHANGE",
      "EVENT_SANCTIONS_PEP",
    ])
    .describe("What triggered this action"),
  reasoning: z
    .string()
    .min(20)
    .describe(
      "Detailed reasoning for why this action was taken. Must include what was observed, why this action was chosen, and the regulatory significance."
    ),
  outcome: z.string().optional().describe("Result of the action"),
  nextScheduledAt: z
    .string()
    .describe("ISO 8601 date for when to check again"),
  documentId: z
    .string()
    .optional()
    .describe("Related document ID, if applicable"),
  stage: z
    .number()
    .int()
    .optional()
    .describe("Escalation or onboarding stage at decision time"),
  policyVersion: z
    .string()
    .optional()
    .describe("Policy matrix version that authorized this action"),
  promptVersionId: z
    .string()
    .optional()
    .describe("PromptVersion id active when this action was taken"),
  actor: z
    .enum(["AGENT", "ADVISOR", "SYSTEM"])
    .optional()
    .describe("Who performed the action"),
  reasonCodes: z
    .array(z.string().min(1))
    .optional()
    .describe("Structured reason codes for examiner reconstruction"),
  citedFields: z
    .record(z.unknown())
    .optional()
    .describe("Cited vault/document fields supporting the decision"),
  idempotencyKey: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Deterministic key so retries cannot double-send the same regulated action",
    ),
});

const outputSchema = z.object({
  success: z.boolean(),
  actionId: z.string(),
  duplicate: z.boolean(),
});

export function buildLogAction(vault: VaultService) {
  return createTool({
    id: "logAction",
    description:
      "Logs an action to the audit trail. Every action tool calls this internally, but you can also call it directly to record observations or decisions.",
    inputSchema,
    outputSchema,
    execute: async (inputData) => {
      // REGULATORY: all consequential actions persist via VaultService ActionLedger only.
      const result = (await vault.logAction({
        agentType: inputData.agentType,
        actionType: inputData.actionType,
        trigger: inputData.trigger,
        reasoning: inputData.reasoning,
        outcome: inputData.outcome,
        nextScheduledAt: new Date(inputData.nextScheduledAt),
        documentId: inputData.documentId,
        stage: inputData.stage,
        policyVersion: inputData.policyVersion,
        promptVersionId: inputData.promptVersionId,
        actor: inputData.actor,
        reasonCodes: inputData.reasonCodes,
        citedFields: inputData.citedFields,
        idempotencyKey: inputData.idempotencyKey,
      })) as Record<string, unknown>;

      return {
        success: true,
        actionId: result.id as string,
        duplicate: Boolean(result.duplicate),
      };
    },
  });
}
