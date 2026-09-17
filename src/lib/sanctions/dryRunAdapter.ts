import { env } from "@/lib/config";
import type { SanctionsCheckAdapter } from "./adapter";
import {
  sanctionsCheckInputSchema,
  type SanctionsCheckResult,
} from "./schemas";

/**
 * DRY_RUN-safe default adapter.
 * Always returns not_checked / dry_run_skipped with vendorClearanceClaimed=false.
 */
export function createDryRunSanctionsCheckAdapter(): SanctionsCheckAdapter {
  return {
    provider: "dry-run",
    async check(input) {
      const parsed = sanctionsCheckInputSchema.parse(input);
      const status: SanctionsCheckResult["status"] = env.DRY_RUN
        ? "dry_run_skipped"
        : "not_checked";
      return {
        provider: "dry-run",
        status,
        vendorClearanceClaimed: false,
        hitId: parsed.hitId ?? null,
        subjectName: parsed.subjectName,
        checkedAt: env.DEMO_DATE,
        adapterNotes: [
          "Sanctions/PEP adapter seam (T2.4): no vendor call performed.",
          "Do not treat this as clearance, match, or non-match.",
          ...(parsed.reason ? [`Caller reason: ${parsed.reason}`] : []),
        ],
      };
    },
  };
}
