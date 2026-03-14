import type { DocumentType } from "@/lib/documents/registry";

export const ONBOARDING_STAGES: Record<
  number,
  { label: string; requiredDocuments: DocumentType[]; description: string }
> = {
  1: {
    label: "Identity Verification",
    requiredDocuments: ["GOVERNMENT_ID", "PROOF_OF_ADDRESS", "SIN_SSN_FORM"],
    description: "Verify client identity and address",
  },
  2: {
    label: "Account Setup",
    requiredDocuments: ["NAAF", "RISK_QUESTIONNAIRE", "CLIENT_AGREEMENT"],
    description: "Create account and suitability baseline",
  },
  3: {
    label: "Compliance & Estate",
    requiredDocuments: ["BENEFICIARY_DESIGNATION", "FEE_DISCLOSURE"],
    description: "Complete compliance and estate documents",
  },
  4: {
    label: "Account Funding",
    requiredDocuments: ["BANKING_INFORMATION", "DEPOSIT_CONFIRMATION"],
    description: "Fund and activate account",
  },
};

export const STAGE_STUCK_THRESHOLD_DAYS = 7;

export const CORPORATE_ADDITIONAL_DOCS: DocumentType[] = [
  "ACCREDITED_INVESTOR_FORM",
  "INVESTMENT_POLICY_STATEMENT",
];
