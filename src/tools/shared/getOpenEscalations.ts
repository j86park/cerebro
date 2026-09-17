import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { VaultService } from "@/lib/db/vault-service";

const inputSchema = z.object({});

const openEscalationSchema = z.object({
  id: z.string(),
  openKey: z.string().nullable(),
  ladderStage: z.number().int(),
  status: z.string(),
  documentId: z.string().nullable(),
  reasonCodes: z.array(z.string()),
  policyVersion: z.string().nullable(),
  openedAt: z.string(),
});

const outputSchema = z.object({
  escalations: z.array(openEscalationSchema),
  openCount: z.number().int().nonnegative(),
});

/**
 * Builds getOpenEscalations — read-only list of open EscalationState for the vault.
 * Call before escalate / after HITL to avoid duplicate open ladders.
 */
export function buildGetOpenEscalations(vault: VaultService) {
  return createTool({
    id: "getOpenEscalations",
    description:
      "Lists open escalations for this client (OPEN, PENDING_APPROVAL, SAFE_HOLD). Call before escalating or after HITL resume to see durable ladder state.",
    inputSchema,
    outputSchema,
    execute: async () => {
      const rows = (await vault.getEscalationStates({ openOnly: true })) as Array<{
        id: string;
        openKey: string | null;
        ladderStage: number;
        status: string;
        documentId: string | null;
        reasonCodes: string[];
        policyVersion: string | null;
        openedAt: Date | string;
      }>;

      const escalations = rows.map((row) => ({
        id: row.id,
        openKey: row.openKey,
        ladderStage: row.ladderStage,
        status: row.status,
        documentId: row.documentId,
        reasonCodes: row.reasonCodes ?? [],
        policyVersion: row.policyVersion,
        openedAt:
          row.openedAt instanceof Date
            ? row.openedAt.toISOString()
            : String(row.openedAt),
      }));

      return {
        escalations,
        openCount: escalations.length,
      };
    },
  });
}
