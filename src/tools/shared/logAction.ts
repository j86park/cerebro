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
    .enum(["SCHEDULED", "EVENT_UPLOAD", "MANUAL", "SIMULATION"])
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
});

const outputSchema = z.object({
  success: z.boolean(),
  actionId: z.string(),
});

export function buildLogAction(vault: VaultService) {
  return createTool({
    id: "logAction",
    description:
      "Logs an action to the audit trail. Every action tool calls this internally, but you can also call it directly to record observations or decisions.",
    inputSchema,
    outputSchema,
    execute: async (inputData) => {
      const result = (await vault.logAction({
        agentType: inputData.agentType,
        actionType: inputData.actionType,
        trigger: inputData.trigger,
        reasoning: inputData.reasoning,
        outcome: inputData.outcome,
        nextScheduledAt: new Date(inputData.nextScheduledAt),
        documentId: inputData.documentId,
      })) as Record<string, unknown>;

      return {
        success: true,
        actionId: result.id as string,
      };
    },
  });
}
