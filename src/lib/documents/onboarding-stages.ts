import {
  ONBOARDING_STAGE_CHECKLIST,
  STAGE_STUCK_THRESHOLD_DAYS,
  type OnboardingStageConfig,
} from "@/lib/documents/checklist";
import type { DocumentType } from "@/lib/documents/registry";

/**
 * Back-compat stage map used by older imports.
 * Prefer `resolveStageChecklist` for account/risk-aware requirements.
 */
export const ONBOARDING_STAGES: Record<
  number,
  { label: string; requiredDocuments: DocumentType[]; description: string }
> = Object.fromEntries(
  Object.entries(ONBOARDING_STAGE_CHECKLIST).map(([stage, cfg]) => [
    Number(stage),
    {
      label: cfg.label,
      description: cfg.description,
      requiredDocuments: cfg.requiredDocuments,
    },
  ]),
);

export { STAGE_STUCK_THRESHOLD_DAYS };
export type { OnboardingStageConfig };

/**
 * @deprecated Prefer resolveStageChecklist account/risk extras.
 * Kept for data-schema parity; stage-2 extras now live in checklist.ts.
 */
export const CORPORATE_ADDITIONAL_DOCS: DocumentType[] = [
  "ACCREDITED_INVESTOR_FORM",
  "INVESTMENT_POLICY_STATEMENT",
];
