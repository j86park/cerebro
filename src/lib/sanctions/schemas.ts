import { z } from "zod";

/**
 * Sanctions/PEP adapter providers.
 * `dry-run` is the only safe default; `alloy` is reserved for a future credentialed stub.
 */
export const sanctionsCheckProviderSchema = z.enum(["dry-run", "alloy"]);

export type SanctionsCheckProvider = z.infer<typeof sanctionsCheckProviderSchema>;

export const sanctionsCheckInputSchema = z.object({
  /** Subject display name from vault profile — never used to invent a clearance. */
  subjectName: z.string().min(1).max(512),
  /** Optional vendor hit id from EVENT_SANCTIONS_PEP enqueue stub. */
  hitId: z.string().min(1).max(256).optional(),
  /** Optional notes for adapter diagnostics (not a policy decision). */
  reason: z.string().max(2_000).optional(),
});

export type SanctionsCheckInput = z.infer<typeof sanctionsCheckInputSchema>;

/**
 * Adapter result. REGULATORY: `vendorClearanceClaimed` is always false on this seam —
 * Cerebro must not fabricate sanctions/PEP clearance without a real vendor response.
 */
export const sanctionsCheckResultSchema = z.object({
  provider: sanctionsCheckProviderSchema,
  status: z.enum([
    "not_checked",
    "dry_run_skipped",
    "vendor_unavailable",
  ]),
  /** Always false on the scaffold — no fake compliance claims. */
  vendorClearanceClaimed: z.literal(false),
  hitId: z.string().nullable(),
  subjectName: z.string(),
  checkedAt: z.string().datetime(),
  adapterNotes: z.array(z.string()).default([]),
});

export type SanctionsCheckResult = z.infer<typeof sanctionsCheckResultSchema>;
