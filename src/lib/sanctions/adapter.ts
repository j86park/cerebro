import type {
  SanctionsCheckInput,
  SanctionsCheckResult,
} from "./schemas";

/**
 * Pluggable sanctions/PEP check adapter.
 * Returns structured status only — Cerebro policy/HITL remains elsewhere.
 * Must never claim vendor clearance without a real configured vendor.
 */
export type SanctionsCheckAdapter = {
  readonly provider: SanctionsCheckResult["provider"];
  check(input: SanctionsCheckInput): Promise<SanctionsCheckResult>;
};
