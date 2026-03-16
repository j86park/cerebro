import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { VaultService } from "@/lib/db/vault-service";
import { env } from "@/lib/config";

const inputSchema = z.object({
  reasoning: z
    .string()
    .min(20)
    .describe(
      "Detailed reasoning for escalating to the compliance officer, including what stages have been completed"
    ),
});

const outputSchema = z.object({
  success: z.boolean(),
  dryRun: z.boolean(),
});

export function buildEscalateToComplianceOfficer(vault: VaultService) {
  return createTool({
    id: "escalateToComplianceOfficer",
    description:
      "Escalates an unresolved compliance issue to the firm's compliance officer. This is Stage 4 of the escalation ladder. PREREQUISITE: At least 2 client reminders must have been sent before this can be called.",
    inputSchema,
    outputSchema,
    execute: async (inputData) => {
      const { reasoning } = inputData;
      const { DRY_RUN } = env;

      // Self-enforce prerequisite: at least 2 client reminders sent
      const history = (await vault.getActionHistory()) as Array<
        Record<string, unknown>
      >;
      const reminderCount = history.filter(
        (a) => a.actionType === "SEND_CLIENT_REMINDER"
      ).length;

      if (reminderCount < 2) {
        throw new Error(
          `Cannot escalate to compliance officer: only ${reminderCount} client reminder(s) sent. ` +
            `At least 2 SEND_CLIENT_REMINDER actions must be completed before escalation (Stages 2 and 3).`
        );
      }

      if (!DRY_RUN) {
        // TODO: Send formal escalation notification via Resend to compliance officer
      }

      // Always log the action
      await vault.logAction({
        agentType: "COMPLIANCE",
        actionType: "ESCALATE_COMPLIANCE",
        trigger: "SCHEDULED",
        reasoning,
        outcome: DRY_RUN ? "DRY_RUN" : "ESCALATED",
        nextScheduledAt: new Date(
          new Date(env.DEMO_DATE).getTime() + 10 * 24 * 60 * 60 * 1000
        ),
      });

      return { success: true, dryRun: DRY_RUN };
    },
  });
}
