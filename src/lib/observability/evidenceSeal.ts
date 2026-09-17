import { createHash } from "node:crypto";
import { env } from "@/lib/config";
import {
  evidenceSealEntrySchema,
  evidenceSealPayloadSchema,
  type EvidenceSealEntry,
  type EvidenceSealPayload,
} from "./evidenceSeal.schemas";

export type {
  EvidenceSealEntry,
  EvidenceSealPayload,
} from "./evidenceSeal.schemas";

export {
  evidenceSealEntrySchema,
  evidenceSealPayloadSchema,
} from "./evidenceSeal.schemas";

/**
 * True when crypto evidence sealing is enabled via config.
 * Default false — production seal today remains append-only ledger + citations.
 */
export function isEvidenceSealEnabled(): boolean {
  return env.EVIDENCE_SEAL;
}

/**
 * Computes sha256 digest of a validated seal payload body.
 */
export function computeEvidenceDigest(payload: EvidenceSealPayload): string {
  const parsed = evidenceSealPayloadSchema.parse(payload);
  const canonical = JSON.stringify(parsed);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/**
 * Builds a chain entry linking `prevDigest` to the payload body digest.
 */
export function sealEvidenceEntry(
  payload: EvidenceSealPayload,
  prevDigest: string | null,
): EvidenceSealEntry {
  const bodyDigest = computeEvidenceDigest(payload);
  const chainMaterial = JSON.stringify({
    prevDigest,
    bodyDigest,
  });
  const digest = createHash("sha256")
    .update(chainMaterial, "utf8")
    .digest("hex");

  return evidenceSealEntrySchema.parse({
    prevDigest,
    digest,
    body: payload,
  });
}

/**
 * Verifies an in-memory evidence seal chain.
 * Detects tampering of digests, broken prev links, and body/digest mismatch.
 */
export function verifyEvidenceChain(entries: EvidenceSealEntry[]): {
  valid: boolean;
  reason: string;
} {
  if (entries.length === 0) {
    return { valid: true, reason: "Empty chain" };
  }

  let expectedPrev: string | null = null;

  for (let i = 0; i < entries.length; i++) {
    const entry = evidenceSealEntrySchema.parse(entries[i]);

    if (entry.prevDigest !== expectedPrev) {
      return {
        valid: false,
        reason: `Broken prevDigest link at index ${i}`,
      };
    }

    const bodyDigest = computeEvidenceDigest(entry.body);
    const expectedDigest: string = createHash("sha256")
      .update(JSON.stringify({ prevDigest: entry.prevDigest, bodyDigest }), "utf8")
      .digest("hex");

    if (entry.digest !== expectedDigest) {
      return {
        valid: false,
        reason: `Digest mismatch at index ${i} (tamper or recompute drift)`,
      };
    }

    expectedPrev = entry.digest;
  }

  return { valid: true, reason: `Verified ${entries.length} seal entr${entries.length === 1 ? "y" : "ies"}` };
}
