import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { VaultService } from "@/lib/db/vault-service";
import { env } from "@/lib/config";

const inputSchema = z.object({
  includeValid: z
    .boolean()
    .default(false)
    .describe(
      "Whether to include valid documents in the response or only problem documents"
    ),
});

const urgencyEnum = z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW", "NONE"]);

const outputSchema = z.object({
  documents: z.array(
    z.object({
      documentId: z.string(),
      type: z.string(),
      category: z.string(),
      status: z.string(),
      daysUntilExpiry: z.number().nullable(),
      notificationCount: z.number(),
      lastNotifiedAt: z.string().nullable(),
      urgency: urgencyEnum,
      regulatoryNote: z.string(),
    })
  ),
  summary: z.object({
    totalDocuments: z.number(),
    expiredCount: z.number(),
    expiringSoonCount: z.number(),
    missingCount: z.number(),
    highestUrgency: urgencyEnum,
  }),
});

function calculateUrgency(
  status: string,
  daysUntilExpiry: number | null
): z.infer<typeof urgencyEnum> {
  if (status === "EXPIRED") return "CRITICAL";
  if (status === "MISSING") return "LOW";
  if (daysUntilExpiry !== null) {
    if (daysUntilExpiry <= 7) return "HIGH";
    if (daysUntilExpiry <= 14) return "MEDIUM";
    if (daysUntilExpiry <= 30) return "LOW";
  }
  return "NONE";
}

function getRegulatoryNote(
  status: string,
  daysUntilExpiry: number | null
): string {
  if (status === "EXPIRED")
    return "Document has expired — regulatory violation risk. Immediate action required.";
  if (status === "MISSING")
    return "Document is missing from the vault. Should be requested from the client.";
  if (daysUntilExpiry !== null && daysUntilExpiry <= 7)
    return `Expires in ${daysUntilExpiry} days — urgent renewal needed.`;
  if (daysUntilExpiry !== null && daysUntilExpiry <= 14)
    return `Expires in ${daysUntilExpiry} days — schedule renewal.`;
  if (daysUntilExpiry !== null && daysUntilExpiry <= 30)
    return `Expires in ${daysUntilExpiry} days — plan for renewal.`;
  return "Document is compliant.";
}

export function buildGetDocumentComplianceStatus(vault: VaultService) {
  return createTool({
    id: "getDocumentComplianceStatus",
    description:
      "Retrieves the compliance status of all documents in this client's vault. Returns urgency levels and days until expiry. Always call this first in a compliance run.",
    inputSchema,
    outputSchema,
    execute: async (inputData) => {
      const { includeValid } = inputData;
      const demoDate = new Date(env.DEMO_DATE);
      const rawDocs = (await vault.getDocuments()) as Array<
        Record<string, unknown>
      >;

      const processedDocs = rawDocs.map((doc) => {
        const expiryDate = doc.expiryDate
          ? new Date(doc.expiryDate as string)
          : null;
        const daysUntilExpiry = expiryDate
          ? Math.ceil(
              (expiryDate.getTime() - demoDate.getTime()) /
                (1000 * 60 * 60 * 24)
            )
          : null;
        const status = doc.status as string;
        const urgency = calculateUrgency(status, daysUntilExpiry);

        return {
          documentId: doc.id as string,
          type: doc.type as string,
          category: doc.category as string,
          status,
          daysUntilExpiry,
          notificationCount: (doc.notificationCount as number) ?? 0,
          lastNotifiedAt: doc.lastNotifiedAt
            ? String(doc.lastNotifiedAt)
            : null,
          urgency,
          regulatoryNote: getRegulatoryNote(status, daysUntilExpiry),
        };
      });

      const filtered = includeValid
        ? processedDocs
        : processedDocs.filter((d) => d.urgency !== "NONE");

      const urgencyOrder: Record<string, number> = {
        CRITICAL: 5,
        HIGH: 4,
        MEDIUM: 3,
        LOW: 2,
        NONE: 1,
      };
      const highestUrgency = (
        filtered.length > 0
          ? filtered.reduce((max, d) =>
              urgencyOrder[d.urgency] > urgencyOrder[max.urgency] ? d : max
            ).urgency
          : "NONE"
      ) as z.infer<typeof urgencyEnum>;

      return {
        documents: filtered,
        summary: {
          totalDocuments: rawDocs.length,
          expiredCount: rawDocs.filter((d) => d.status === "EXPIRED").length,
          expiringSoonCount: rawDocs.filter(
            (d) => d.status === "EXPIRING_SOON"
          ).length,
          missingCount: rawDocs.filter((d) => d.status === "MISSING").length,
          highestUrgency,
        },
      };
    },
  });
}
