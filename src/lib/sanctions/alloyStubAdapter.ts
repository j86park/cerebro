import { env } from "@/lib/config";
import type { SanctionsCheckAdapter } from "./adapter";
import { sanctionsCheckInputSchema } from "./schemas";

/**
 * Stub for a future Alloy (or similar) sanctions/PEP vendor.
 * Not wired to Alloy credentials — fails closed; never invents clearance.
 *
 * REGULATORY: Plan §5.8 — no forensic IDV / Alloy identity graph / AML workforce.
 * Under DRY_RUN, returns a skipped result instead of throwing so tools stay safe.
 */
export function createAlloySanctionsCheckAdapter(): SanctionsCheckAdapter {
  return {
    provider: "alloy",
    async check(input) {
      const parsed = sanctionsCheckInputSchema.parse(input);

      if (env.DRY_RUN) {
        return {
          provider: "alloy",
          status: "dry_run_skipped" as const,
          vendorClearanceClaimed: false as const,
          hitId: parsed.hitId ?? null,
          subjectName: parsed.subjectName,
          checkedAt: env.DEMO_DATE,
          adapterNotes: [
            "Alloy sanctions/PEP provider selected but DRY_RUN=true — no external call.",
            "vendorClearanceClaimed remains false; escalate if EVENT_SANCTIONS_PEP evidence is thin.",
          ],
        };
      }

      throw new Error(
        "Sanctions check provider 'alloy' is not configured. " +
          "Use SANCTIONS_CHECK_PROVIDER=dry-run (default), or implement the Alloy " +
          "adapter with credentials. Do not invent sanctions/PEP clearance.",
      );
    },
  };
}
