import { env } from "@/lib/config";
import type { SanctionsCheckAdapter } from "./adapter";
import { createAlloySanctionsCheckAdapter } from "./alloyStubAdapter";
import { createDryRunSanctionsCheckAdapter } from "./dryRunAdapter";
import {
  sanctionsCheckProviderSchema,
  type SanctionsCheckProvider,
} from "./schemas";

/**
 * Resolves the configured sanctions/PEP check adapter.
 * Provider comes from `env.SANCTIONS_CHECK_PROVIDER` only (never scattered process.env).
 */
export function getSanctionsCheckAdapter(
  providerOverride?: SanctionsCheckProvider,
): SanctionsCheckAdapter {
  const provider = sanctionsCheckProviderSchema.parse(
    providerOverride ?? env.SANCTIONS_CHECK_PROVIDER,
  );

  switch (provider) {
    case "dry-run":
      return createDryRunSanctionsCheckAdapter();
    case "alloy":
      return createAlloySanctionsCheckAdapter();
    default: {
      const _exhaustive: never = provider;
      throw new Error(
        `Unknown sanctions check provider: ${String(_exhaustive)}`,
      );
    }
  }
}
