import { VaultService } from "@/lib/db/vault-service";
import { DOCUMENT_REGISTRY, getRequiredDocs } from "@/lib/documents/registry";
import { DocumentStatus } from "@/lib/db/enums";
import { env } from "@/lib/config";

export type UrgencyLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "NONE";

export interface ScorecardDocument {
  documentId: string | null;
  type: string;
  category: string;
  status: string;
  daysUntilExpiry: number | null;
  notificationCount: number;
  lastNotifiedAt: string | null;
  urgency: UrgencyLevel;
  regulatoryNote: string;
  isBlocker: boolean;
}

export interface ComplianceScorecard {
  documents: ScorecardDocument[];
  summary: {
    totalDocuments: number;
    expiredCount: number;
    expiringSoonCount: number;
    missingCount: number;
    highestUrgency: UrgencyLevel;
    hasBlocker: boolean;
    score: number; // 0-100
  };
}

export function calculateUrgency(
  status: string,
  daysUntilExpiry: number | null,
  type: string
): UrgencyLevel {
  if (status === DocumentStatus.EXPIRED) return "CRITICAL";
  if (status === DocumentStatus.MISSING) {
    const reg = (DOCUMENT_REGISTRY as any)[type];
    if (reg?.category === "IDENTITY") return "HIGH";
    return "LOW";
  }
  if (daysUntilExpiry !== null) {
    if (daysUntilExpiry <= 7) return "HIGH";
    if (daysUntilExpiry <= 14) return "MEDIUM";
    if (daysUntilExpiry <= 30) return "LOW";
  }
  return "NONE";
}

export function getRegulatoryNote(
  status: string,
  daysUntilExpiry: number | null,
  type: string
): string {
  if (status === DocumentStatus.EXPIRED)
    return "Document has expired — regulatory violation risk. Immediate action required.";
  if (status === DocumentStatus.MISSING) {
    const reg = (DOCUMENT_REGISTRY as any)[type];
    if (reg?.category === "IDENTITY")
      return `Critical identity document (${reg.label}) is missing. This blocks further compliance processing.`;
    return `Required document (${reg?.label || type}) is missing from the vault.`;
  }
  if (daysUntilExpiry !== null && daysUntilExpiry <= 7)
    return `Expires in ${daysUntilExpiry} days — urgent renewal needed.`;
  if (daysUntilExpiry !== null && daysUntilExpiry <= 14)
    return `Expires in ${daysUntilExpiry} days — schedule renewal.`;
  if (daysUntilExpiry !== null && daysUntilExpiry <= 30)
    return `Expires in ${daysUntilExpiry} days — plan for renewal.`;
  return "Document is compliant.";
}

export async function getComplianceScorecard(vault: VaultService): Promise<ComplianceScorecard> {
  const demoDate = new Date(env.DEMO_DATE);
  const profile = (await vault.getClientProfile()) as {
    accountType: string;
  };
  const requiredTypes = getRequiredDocs(profile.accountType);

  const existingDocs = (await vault.getDocuments()) as Array<Record<string, any>>;
  const existingTypes = existingDocs.map((d) => d.type);

  // 1. Identify actually missing document types
  const missingTypes = requiredTypes.filter((t) => !existingTypes.includes(t));

  // 2. Map existing documents
  const mappedDocs = existingDocs.map((doc) => {
    const expiryDate = doc.expiryDate ? new Date(doc.expiryDate) : null;
    const daysUntilExpiry = expiryDate
      ? Math.ceil((expiryDate.getTime() - demoDate.getTime()) / (1000 * 60 * 60 * 24))
      : null;
    const status = doc.status as string;
    const urgency = calculateUrgency(status, daysUntilExpiry, doc.type as string);
    const isBlocker =
      (DOCUMENT_REGISTRY as any)[doc.type]?.category === "IDENTITY" &&
      (status === DocumentStatus.EXPIRED || status === DocumentStatus.MISSING);

    return {
      documentId: doc.id as string,
      type: doc.type as string,
      category: doc.category as string,
      status,
      daysUntilExpiry,
      notificationCount: (doc.notificationCount as number) ?? 0,
      lastNotifiedAt: doc.lastNotifiedAt ? String(doc.lastNotifiedAt) : null,
      urgency,
      regulatoryNote: getRegulatoryNote(status, daysUntilExpiry, doc.type as string),
      isBlocker,
    };
  });

  // 3. Map missing documents
  const missingDocs = missingTypes.map((type) => {
    const reg = (DOCUMENT_REGISTRY as any)[type];
    const status = DocumentStatus.MISSING;
    const urgency = calculateUrgency(status, null, type);
    const isBlocker = reg?.category === "IDENTITY";

    return {
      documentId: null,
      type,
      category: reg?.category || "UNKNOWN",
      status,
      daysUntilExpiry: null,
      notificationCount: 0,
      lastNotifiedAt: null,
      urgency,
      regulatoryNote: getRegulatoryNote(status, null, type),
      isBlocker,
    };
  });

  const allDocs = [...mappedDocs, ...missingDocs];
  const hasBlocker = allDocs.some((d) => d.isBlocker);

  const urgencyOrder: Record<string, number> = {
    CRITICAL: 5,
    HIGH: 4,
    MEDIUM: 3,
    LOW: 2,
    NONE: 1,
  };

  const highestUrgency = (
    allDocs.length > 0
      ? allDocs.reduce((max, d) => (urgencyOrder[d.urgency] > urgencyOrder[max.urgency] ? d : max))
          .urgency
      : "NONE"
  ) as UrgencyLevel;

  // Simple Score Calculation: 100 base, -20 for blocker, -10 per expired, -5 per missing non-blocker
  let score = 100;
  if (hasBlocker) score -= 30;
  score -= allDocs.filter(d => d.status === DocumentStatus.EXPIRED).length * 15;
  score -= allDocs.filter(d => d.status === DocumentStatus.MISSING && !d.isBlocker).length * 5;
  score = Math.max(0, score);

  return {
    documents: allDocs,
    summary: {
      totalDocuments: allDocs.length,
      expiredCount: allDocs.filter((d) => d.status === DocumentStatus.EXPIRED).length,
      expiringSoonCount: allDocs.filter((d) => d.status === DocumentStatus.EXPIRING_SOON).length,
      missingCount: allDocs.filter((d) => d.status === DocumentStatus.MISSING).length,
      highestUrgency,
      hasBlocker,
      score,
    },
  };
}
