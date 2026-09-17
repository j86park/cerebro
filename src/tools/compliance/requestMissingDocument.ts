import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { VaultService } from "@/lib/db/vault-service";
import { env } from "@/lib/config";
import { addDemoDays } from "@/lib/dates/demo-date";
import { sendTransactionalEmail } from "@/lib/email/resend";
import { getComplianceScorecard } from "@/lib/compliance/scorecard";
import {
  categoryForDocumentType,
  documentTypeSchema,
} from "@/lib/documents/checklist";
import { resolveComplianceLadderStage } from "@/lib/policy/ladder";
import { enforceToolPolicy } from "@/lib/policy";

const inputSchema = z.object({
  documentType: z
    .string()
    .describe("Required document type that is MISSING from the compliance scorecard"),
  message: z
    .string()
    .min(10)
    .describe("Client-facing request explaining why the document is required"),
  reasoning: z
    .string()
    .min(20)
    .describe("Detailed reasoning for requesting this missing compliance document"),
});

const outputSchema = z.object({
  success: z.boolean(),
  dryRun: z.boolean(),
  policyVersion: z.string(),
  documentType: z.string(),
  wasMissing: z.boolean(),
});

/**
 * Builds requestMissingDocument — compliance-domain path for scorecard MISSING rows.
 * REGULATORY: does not replace the escalation ladder; use with stage-1 notify as needed.
 */
export function buildRequestMissingDocument(vault: VaultService) {
  return createTool({
    id: "requestMissingDocument",
    description:
      "Requests a document that appears as MISSING on the compliance scorecard. Creates/updates a REQUESTED vault row and emails the client. Prefer after getDocumentComplianceStatus shows missingCount > 0. Does not skip the escalation ladder for expired/expiring issues.",
    inputSchema,
    outputSchema,
    execute: async (inputData) => {
      const { documentType, message, reasoning } = inputSchema.parse(inputData);
      const { DRY_RUN } = env;
      const parsedType = documentTypeSchema.parse(documentType);

      const scorecard = await getComplianceScorecard(vault);
      const missingRow = scorecard.documents.find(
        (d) => d.type === parsedType && d.status === "MISSING",
      );
      if (!missingRow) {
        throw new Error(
          `Document type ${parsedType} is not MISSING on the compliance scorecard. ` +
            `Call getDocumentComplianceStatus first and only request types with status MISSING.`,
        );
      }

      const history = (await vault.getActionHistory()) as Array<{
        actionType: string;
      }>;
      const stage = resolveComplianceLadderStage(history);

      const policy = await enforceToolPolicy({
        vault,
        domain: "compliance",
        stage,
        toolName: "requestMissingDocument",
        agentType: "COMPLIANCE",
        actionType: "REQUEST_DOCUMENT",
        reasoning,
        args: { documentType: parsedType },
      });

      await vault.checkActionCooldown("REQUEST_DOCUMENT", 3);

      const client = (await vault.getClientProfile()) as Record<
        string,
        unknown
      >;

      await sendTransactionalEmail({
        to: z.string().email().parse(client.email),
        subject: `Required document: ${parsedType}`,
        text: message,
      });

      await vault.upsertDocument({
        type: parsedType,
        category: categoryForDocumentType(parsedType),
        status: "REQUESTED",
      });

      await vault.logAction({
        agentType: "COMPLIANCE",
        actionType: "REQUEST_DOCUMENT",
        trigger: "SCHEDULED",
        reasoning,
        outcome: DRY_RUN ? "DRY_RUN" : "REQUEST_SENT",
        nextScheduledAt: addDemoDays(3),
        stage: policy.stage,
        policyVersion: policy.policyVersion,
        reasonCodes: [
          "POLICY_ALLOW_AUTO",
          "COMPLIANCE_MISSING_DOC_REQUEST",
          missingRow.isBlocker ? "MISSING_BLOCKER" : "MISSING_NON_BLOCKER",
        ],
        citedFields: {
          documentType: parsedType,
          urgency: missingRow.urgency,
          isBlocker: missingRow.isBlocker,
        },
      });

      return {
        success: true,
        dryRun: DRY_RUN,
        policyVersion: policy.policyVersion,
        documentType: parsedType,
        wasMissing: true,
      };
    },
  });
}
