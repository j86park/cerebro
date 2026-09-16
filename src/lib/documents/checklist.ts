import { z } from "zod";
import {
  DOCUMENT_REGISTRY,
  type DocumentType,
} from "@/lib/documents/registry";
import {
  demoNow,
  isExpired,
  isWithinRecencyYears,
  daysUntilExpiry,
} from "@/lib/dates/demo-date";

/** Document type keys validated against the registry. */
export const documentTypeSchema = z.enum(
  Object.keys(DOCUMENT_REGISTRY) as [
    DocumentType,
    ...DocumentType[],
  ],
);

export const riskProfileSchema = z.enum([
  "CONSERVATIVE",
  "MODERATE",
  "AGGRESSIVE",
]);

export const accountTypeSchema = z.enum([
  "RRSP",
  "TFSA",
  "INVESTMENT",
  "CORPORATE",
  "JOINT",
]);

export const onboardingStageConfigSchema = z.object({
  stage: z.number().int().min(1).max(4),
  label: z.string().min(1),
  description: z.string().min(1),
  requiredDocuments: z.array(documentTypeSchema).min(1),
});

export type OnboardingStageConfig = z.infer<typeof onboardingStageConfigSchema>;

export const checklistContextSchema = z.object({
  stage: z.number().int().min(0).max(4),
  accountType: accountTypeSchema,
  riskProfile: riskProfileSchema.nullable().optional(),
});

export type ChecklistContext = z.infer<typeof checklistContextSchema>;

export const checklistGapReasonSchema = z.enum([
  "MISSING",
  "NOT_VALID",
  "EXPIRED",
  "STALE_RECENCY",
]);

export type ChecklistGapReason = z.infer<typeof checklistGapReasonSchema>;

export const checklistGapSchema = z.object({
  documentType: documentTypeSchema,
  reason: checklistGapReasonSchema,
  detail: z.string(),
  status: z.string(),
});

export type ChecklistGap = z.infer<typeof checklistGapSchema>;

export const documentValidityResultSchema = z.object({
  valid: z.boolean(),
  documentType: z.string(),
  status: z.string(),
  notes: z.string(),
  gapReason: checklistGapReasonSchema.nullable(),
  daysUntilExpiry: z.number().nullable(),
  expired: z.boolean(),
  staleRecency: z.boolean(),
});

export type DocumentValidityResult = z.infer<typeof documentValidityResultSchema>;

/**
 * REGULATORY: base required documents per onboarding stage (firm default matrix).
 * Extras for account type / risk tier are layered in `resolveStageChecklist`.
 */
const BASE_STAGE_CHECKLIST: OnboardingStageConfig[] = [
  {
    stage: 1,
    label: "Identity Verification",
    description: "Verify client identity and address",
    requiredDocuments: ["GOVERNMENT_ID", "PROOF_OF_ADDRESS", "SIN_SSN_FORM"],
  },
  {
    stage: 2,
    label: "Account Setup",
    description: "Create account and suitability baseline",
    requiredDocuments: ["NAAF", "RISK_QUESTIONNAIRE", "CLIENT_AGREEMENT"],
  },
  {
    stage: 3,
    label: "Compliance & Estate",
    description: "Complete compliance and estate documents",
    requiredDocuments: ["BENEFICIARY_DESIGNATION", "FEE_DISCLOSURE"],
  },
  {
    stage: 4,
    label: "Account Funding",
    description: "Fund and activate account",
    requiredDocuments: ["BANKING_INFORMATION", "DEPOSIT_CONFIRMATION"],
  },
];

/** REGULATORY: corporate entity proofs required at account-setup stage. */
const CORPORATE_STAGE_2_EXTRAS: DocumentType[] = [
  "ARTICLES_OF_INCORPORATION",
  "AUTHORIZED_SIGNATORY_LIST",
];

/**
 * REGULATORY: accredited / IPS extras for aggressive risk or investment-style accounts.
 * Maps former unused CORPORATE_ADDITIONAL_DOCS + registry accountTypes.
 */
const SUITABILITY_STAGE_2_EXTRAS: DocumentType[] = [
  "ACCREDITED_INVESTOR_FORM",
  "INVESTMENT_POLICY_STATEMENT",
];

const validatedBase = z.array(onboardingStageConfigSchema).parse(BASE_STAGE_CHECKLIST);

/**
 * Zod-validated base stage map (stage number → config without risk/account extras).
 */
export const ONBOARDING_STAGE_CHECKLIST: Record<number, OnboardingStageConfig> =
  Object.fromEntries(validatedBase.map((s) => [s.stage, s]));

export const STAGE_STUCK_THRESHOLD_DAYS = 7;

type VaultDocumentLike = {
  type: string;
  status: string;
  expiryDate?: Date | string | null;
  uploadedAt?: Date | string | null;
};

/**
 * Resolves required documents for a stage given account type and risk profile.
 */
export function resolveStageChecklist(
  context: ChecklistContext,
): OnboardingStageConfig | null {
  const parsed = checklistContextSchema.parse(context);
  const base = ONBOARDING_STAGE_CHECKLIST[parsed.stage];
  if (!base) return null;

  const required = new Set<DocumentType>(base.requiredDocuments);

  // REGULATORY: corporate accounts need entity formation docs at stage 2.
  if (parsed.accountType === "CORPORATE" && parsed.stage === 2) {
    for (const doc of CORPORATE_STAGE_2_EXTRAS) required.add(doc);
  }

  // REGULATORY: aggressive risk or INVESTMENT/CORPORATE accounts need suitability extras.
  const needsSuitabilityExtras =
    parsed.riskProfile === "AGGRESSIVE" ||
    parsed.accountType === "INVESTMENT" ||
    parsed.accountType === "CORPORATE";

  if (needsSuitabilityExtras && parsed.stage === 2) {
    for (const doc of SUITABILITY_STAGE_2_EXTRAS) required.add(doc);
  }

  return onboardingStageConfigSchema.parse({
    ...base,
    requiredDocuments: [...required],
  });
}

/**
 * Total configured onboarding stages.
 */
export function getTotalOnboardingStages(): number {
  return Object.keys(ONBOARDING_STAGE_CHECKLIST).length;
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

/**
 * REGULATORY: deterministic document validity vs DEMO_DATE (expiry + recency).
 * Does not trust LLM judgments — status + date arithmetic only.
 */
export function validateDocumentDeterministic(
  doc: VaultDocumentLike | null | undefined,
  documentType: string,
): DocumentValidityResult {
  if (!doc) {
    return documentValidityResultSchema.parse({
      valid: false,
      documentType,
      status: "MISSING",
      notes: `Document ${documentType} is missing from the vault.`,
      gapReason: "MISSING",
      daysUntilExpiry: null,
      expired: false,
      staleRecency: false,
    });
  }

  const status = doc.status;
  const expiry = toDate(doc.expiryDate);
  const uploadedAt = toDate(doc.uploadedAt);
  const asOf = demoNow();
  const expired = isExpired(expiry, asOf);
  const days =
    expiry !== null ? daysUntilExpiry(expiry, asOf) : null;

  const registry =
    documentType in DOCUMENT_REGISTRY
      ? DOCUMENT_REGISTRY[documentType as DocumentType]
      : undefined;

  if (expired) {
    return documentValidityResultSchema.parse({
      valid: false,
      documentType: doc.type,
      status: status === "EXPIRED" ? status : "EXPIRED",
      notes: `Document ${doc.type} expired relative to DEMO_DATE${
        days !== null ? ` (${Math.abs(days)} day(s) past)` : ""
      }.`,
      gapReason: "EXPIRED",
      daysUntilExpiry: days,
      expired: true,
      staleRecency: false,
    });
  }

  if (status !== "VALID") {
    return documentValidityResultSchema.parse({
      valid: false,
      documentType: doc.type,
      status,
      notes: `Document ${doc.type} has status ${status} — must be VALID.`,
      gapReason: status === "MISSING" ? "MISSING" : "NOT_VALID",
      daysUntilExpiry: days,
      expired: false,
      staleRecency: false,
    });
  }

  // REGULATORY: after status=VALID, enforce dated-within recency vs DEMO_DATE.
  let staleRecency = false;
  if (
    registry?.expiryRuleYears != null &&
    registry.expiryRuleYears > 0 &&
    (registry.regulatoryNote.toLowerCase().includes("within") ||
      expiry === null)
  ) {
    if (!uploadedAt) {
      if (registry.regulatoryNote.toLowerCase().includes("within")) {
        staleRecency = true;
      }
    } else if (
      !isWithinRecencyYears(uploadedAt, registry.expiryRuleYears, asOf)
    ) {
      staleRecency = true;
    }
  }

  if (staleRecency) {
    return documentValidityResultSchema.parse({
      valid: false,
      documentType: doc.type,
      status,
      notes: `Document ${doc.type} fails recency rule (${registry?.expiryRuleYears} year(s) vs DEMO_DATE).`,
      gapReason: "STALE_RECENCY",
      daysUntilExpiry: days,
      expired: false,
      staleRecency: true,
    });
  }

  return documentValidityResultSchema.parse({
    valid: true,
    documentType: doc.type,
    status,
    notes: `Document ${doc.type} is VALID and within DEMO_DATE expiry/recency rules.`,
    gapReason: null,
    daysUntilExpiry: days,
    expired: false,
    staleRecency: false,
  });
}

/**
 * Computes checklist gaps for a stage (missing / invalid / expired / stale).
 */
export function computeChecklistGaps(
  context: ChecklistContext,
  documents: VaultDocumentLike[],
): ChecklistGap[] {
  const stageConfig = resolveStageChecklist(context);
  if (!stageConfig) return [];

  const gaps: ChecklistGap[] = [];
  for (const docType of stageConfig.requiredDocuments) {
    const doc = documents.find((d) => d.type === docType);
    const result = validateDocumentDeterministic(doc, docType);
    if (!result.valid && result.gapReason) {
      gaps.push(
        checklistGapSchema.parse({
          documentType: docType,
          reason: result.gapReason,
          detail: result.notes,
          status: result.status,
        }),
      );
    }
  }
  return gaps;
}

/**
 * Snapshot payload suitable for OnboardingStage.checklistSnapshot.
 */
export function buildChecklistSnapshot(
  context: ChecklistContext,
  documents: VaultDocumentLike[],
): Record<string, unknown> {
  const stageConfig = resolveStageChecklist(context);
  const gaps = computeChecklistGaps(context, documents);
  return {
    stage: context.stage,
    accountType: context.accountType,
    riskProfile: context.riskProfile ?? null,
    requiredDocuments: stageConfig?.requiredDocuments ?? [],
    gaps,
    evaluatedAt: demoNow().toISOString(),
  };
}

/**
 * Formats a blocking error when checklist gaps prevent stage advance/complete.
 */
export function formatChecklistBlockMessage(
  stage: number,
  stageLabel: string,
  gaps: ChecklistGap[],
): string {
  const parts = gaps.map((g) => `${g.documentType} (${g.reason}: ${g.status})`);
  return (
    `Cannot advance stage: checklist incomplete for Stage ${stage} (${stageLabel}). ` +
    `Gaps: ${parts.join("; ")}. ` +
    `All required documents must be VALID and within DEMO_DATE expiry/recency rules.`
  );
}

/**
 * Looks up registry category for a document type (fallback IDENTITY).
 */
export function categoryForDocumentType(documentType: string): string {
  if (documentType in DOCUMENT_REGISTRY) {
    return DOCUMENT_REGISTRY[documentType as DocumentType].category;
  }
  return "IDENTITY";
}

/**
 * Whether a document type is required by the current stage checklist.
 */
export function isDocumentOnStageChecklist(
  context: ChecklistContext,
  documentType: string,
): boolean {
  const stageConfig = resolveStageChecklist(context);
  if (!stageConfig) return false;
  return stageConfig.requiredDocuments.includes(documentType as DocumentType);
}
