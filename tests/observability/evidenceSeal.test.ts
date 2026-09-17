import { describe, expect, it } from "vitest";
import {
  computeEvidenceDigest,
  isEvidenceSealEnabled,
  sealEvidenceEntry,
  verifyEvidenceChain,
} from "@/lib/observability/evidenceSeal";

const basePayload = {
  clientId: "CLT-003",
  jobId: "scan:CLT-003:2026-03-15",
  outcome: "dry_run",
  toolExecuted: ["sendClientReminder"],
  policyVersion: "tool-policy-v1",
  citedFieldKeys: ["expiry_date"],
  sealedAt: "2026-03-15T00:00:00.000Z",
};

describe("evidence seal (SOTA P2.6 watch)", () => {
  it("defaults disabled — helpers still usable in tests", () => {
    expect(isEvidenceSealEnabled()).toBe(false);
  });

  it("computes stable sha256 digest for payload", () => {
    const a = computeEvidenceDigest(basePayload);
    const b = computeEvidenceDigest(basePayload);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(a).toBe(b);
  });

  it("verifies a two-entry chain", () => {
    const e0 = sealEvidenceEntry(basePayload, null);
    const e1 = sealEvidenceEntry(
      {
        ...basePayload,
        outcome: "executed",
        toolExecuted: ["logAction"],
        sealedAt: "2026-03-15T00:01:00.000Z",
      },
      e0.digest,
    );

    const ok = verifyEvidenceChain([e0, e1]);
    expect(ok.valid).toBe(true);
  });

  it("detects tampered digest", () => {
    const e0 = sealEvidenceEntry(basePayload, null);
    const tampered = {
      ...e0,
      digest: "b".repeat(64),
    };
    const result = verifyEvidenceChain([tampered]);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/mismatch|tamper/i);
  });

  it("detects broken prevDigest link", () => {
    const e0 = sealEvidenceEntry(basePayload, null);
    const e1 = sealEvidenceEntry(
      { ...basePayload, outcome: "blocked", sealedAt: "2026-03-15T00:02:00.000Z" },
      e0.digest,
    );
    const broken = { ...e1, prevDigest: "c".repeat(64) };
    const result = verifyEvidenceChain([e0, broken]);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/prevDigest/i);
  });
});
