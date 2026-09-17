import { z } from "zod";

/**
 * AGLedger-style evidence seal envelope (SOTA P2.6 watch).
 * Pure helpers only — no Prisma migration until FutureVault requires crypto seals.
 */
export const evidenceSealPayloadSchema = z.object({
  clientId: z.string().min(1),
  jobId: z.string().min(1),
  outcome: z.string().min(1),
  toolExecuted: z.array(z.string()).default([]),
  policyVersion: z.string().min(1),
  citedFieldKeys: z.array(z.string()).default([]),
  /** ISO timestamp — callers should prefer env.DEMO_DATE-derived stamps in tests. */
  sealedAt: z.string().datetime(),
});

export type EvidenceSealPayload = z.infer<typeof evidenceSealPayloadSchema>;

export const evidenceSealEntrySchema = z.object({
  /** sha256 hex of previous entry digest, or null for genesis. */
  prevDigest: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  /** sha256 hex of this entry (prevDigest + body digest). */
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  body: evidenceSealPayloadSchema,
});

export type EvidenceSealEntry = z.infer<typeof evidenceSealEntrySchema>;
