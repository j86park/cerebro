import { DocumentStatus, DocumentType, DocumentCategory, AccountType, OnboardingStatus } from "@/lib/db/enums";

// Simple seeded random generator
export class SeededRandom {
  private seed: number;
  constructor(seed: string) {
    this.seed = this.hashString(seed);
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  }

  next(): number {
    this.seed = (this.seed * 1664525 + 1013904223) | 0;
    return (this.seed >>> 0) / 0xffffffff;
  }

  pick<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  boolean(probability = 0.5): boolean {
    return this.next() < probability;
  }
}

export type ClientProfile = "IDEAL" | "MESSY" | "HIGH_RISK";

export class EntityFactory {
  private rng: SeededRandom;
  private baseDate: Date;

  constructor(seed: string, baseDate: Date = new Date()) {
    this.rng = new SeededRandom(seed);
    this.baseDate = baseDate;
  }

  generateClients(count: number, startIndex: number = 0) {
    const clients = [];
    for (let i = 0; i < count; i++) {
        const index = startIndex + i;
        const name = this.generateName();
        clients.push({
            name,
            email: this.generateEmail(name, index),
            accountType: this.rng.pick(Object.values(AccountType)),
            onboardingStatus: OnboardingStatus.IN_PROGRESS,
            onboardingStage: Math.floor(this.rng.next() * 3),
        });
    }
    return clients;
  }

  generateDocuments(clientId: string, profile: ClientProfile) {
    const docs = [];
    const docTypes = Object.values(DocumentType);

    for (const type of docTypes) {
      if (this.shouldIncludeDoc(type, profile)) {
        docs.push({
          clientId,
          type: type as string,
          category: this.getCategoryForType(type as string),
          status: this.getStatusForProfile(profile),
          expiryDate: this.getExpiryForProfile(profile),
        });
      }
    }
    return docs;
  }

  private generateName() {
    const firsts = ["James", "Mary", "Robert", "Patricia", "John", "Jennifer", "Michael", "Linda"];
    const lasts = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis"];
    return `${this.rng.pick(firsts)} ${this.rng.pick(lasts)}`;
  }

  private generateEmail(name: string, index: number) {
    return `${name.toLowerCase().replace(" ", ".")}.${index}@example.com`;
  }

  private getCategoryForType(type: string): string {
    if (["GOVERNMENT_ID", "PROOF_OF_ADDRESS", "SIN_SSN_FORM"].includes(type)) return DocumentCategory.IDENTITY;
    if (["KYC_FORM", "AML_VERIFICATION", "NAAF", "RISK_QUESTIONNAIRE"].includes(type)) return DocumentCategory.COMPLIANCE;
    if (["INVESTMENT_POLICY_STATEMENT", "SUITABILITY_ASSESSMENT"].includes(type)) return DocumentCategory.SUITABILITY;
    return DocumentCategory.LEGAL;
  }

  private shouldIncludeDoc(type: string, profile: ClientProfile): boolean {
    if (profile === "IDEAL") return true;
    if (profile === "MESSY") return this.rng.boolean(0.7);
    return this.rng.boolean(0.9);
  }

  private getStatusForProfile(profile: ClientProfile): string {
    if (profile === "IDEAL") return DocumentStatus.VALID;
    if (profile === "MESSY") return this.rng.pick([DocumentStatus.MISSING, DocumentStatus.PENDING_REVIEW, DocumentStatus.VALID]);
    return this.rng.pick([DocumentStatus.EXPIRED, DocumentStatus.MISSING]);
  }

  private getExpiryForProfile(profile: ClientProfile): Date | null {
    const now = this.baseDate;
    if (profile === "IDEAL") return new Date(now.getTime() + 1000 * 60 * 60 * 24 * 365); // 1 year out
    if (profile === "HIGH_RISK") return new Date(now.getTime() - 1000 * 60 * 60 * 24 * 30); // 30 days ago
    return this.rng.boolean(0.5) ? new Date(now.getTime() + 1000 * 60 * 60 * 24 * 14) : null;
  }
}
