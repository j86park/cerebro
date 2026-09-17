import { z } from "zod";
import { CANARY_CLIENT_IDS } from "@/evals/ground-truth";
import type { EvalRunMode } from "@/evals/scorer-selection";
import { env } from "@/lib/config";

/**
 * Suite selection modes (cheap-eval PR2).
 * - `canary` — stratified canary partition only (PR / mutation ship path)
 * - `full` — entire GROUND_TRUTH (+ approved goldens); nightly / explicit release
 * - `smoke` — seeded subsample; always labeled **non-final**
 * - `clientIds` — explicit allowlist (debugging / targeted live)
 *
 * REGULATORY: never treat smoke scores as a release quality gate.
 */
export const suiteModeSchema = z.enum(["canary", "full", "smoke", "clientIds"]);
export type SuiteMode = z.infer<typeof suiteModeSchema>;

export const smokeOptionsSchema = z.object({
  sample: z.number().int().positive().max(500),
  seed: z.string().min(1),
});
export type SmokeOptions = z.infer<typeof smokeOptionsSchema>;

export const suiteSelectionSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("canary") }),
  z.object({ mode: z.literal("full") }),
  z.object({
    mode: z.literal("smoke"),
    sample: z.number().int().positive().max(500),
    seed: z.string().min(1),
  }),
  z.object({
    mode: z.literal("clientIds"),
    clientIds: z.array(z.string().min(1)).min(1),
  }),
]);
export type SuiteSelection = z.infer<typeof suiteSelectionSchema>;

export type SuiteResolution = {
  selection: SuiteSelection;
  /** Client ids selected for this run (order preserved after filter/sample). */
  clientIds: string[];
  /**
   * Final ship/nightly label. Smoke (and only smoke) is always non-final.
   * Explicit `clientIds` subsets are non-final unless they exactly equal the canary set
   * or the full catalog — callers should prefer named modes.
   */
  isFinal: boolean;
  /** Recommended scorer mode when the caller does not override. */
  defaultScorerMode: EvalRunMode;
};

/**
 * Smoke is never a release-quality suite. Canary and full are final labels.
 * Explicit `clientIds` is exploratory / non-final by default.
 */
export function isFinalSuite(selection: SuiteSelection): boolean {
  return selection.mode === "canary" || selection.mode === "full";
}

/**
 * Default scorer attachment for a suite: canary + smoke stay hard-only (`canary-ci`);
 * full / clientIds attach soft judges (still short-circuited on hard fail).
 */
export function defaultScorerModeForSuite(
  selection: SuiteSelection
): EvalRunMode {
  if (selection.mode === "canary" || selection.mode === "smoke") {
    return "canary-ci";
  }
  return "full";
}

/**
 * FNV-1a 32-bit hash for deterministic smoke seeds (no crypto dependency).
 */
export function hashSeedToUint32(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Mulberry32 PRNG — deterministic given a uint32 seed.
 */
export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Seeded subsample without replacement. If `sample >= pool.length`, returns a
 * deterministic shuffle of the full pool (still labeled non-final when used as smoke).
 */
export function seededSample<T>(
  pool: readonly T[],
  sample: number,
  seed: string
): T[] {
  const parsed = smokeOptionsSchema.parse({ sample, seed });
  if (pool.length === 0) return [];
  const rng = mulberry32(hashSeedToUint32(parsed.seed));
  const copy = [...pool];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = tmp;
  }
  const n = Math.min(parsed.sample, copy.length);
  return copy.slice(0, n);
}

/**
 * Resolves which client ids to run for a suite selection against a catalog of ids.
 */
export function resolveSuiteClientIds(
  selection: SuiteSelection,
  allClientIds: readonly string[],
  canaryClientIds: ReadonlySet<string> = CANARY_CLIENT_IDS
): string[] {
  const parsed = suiteSelectionSchema.parse(selection);
  switch (parsed.mode) {
    case "canary":
      return allClientIds.filter((id) => canaryClientIds.has(id));
    case "full":
      return [...allClientIds];
    case "clientIds": {
      const want = new Set(parsed.clientIds);
      const resolved = allClientIds.filter((id) => want.has(id));
      const missing = parsed.clientIds.filter(
        (id) => !allClientIds.includes(id)
      );
      if (missing.length > 0) {
        throw new Error(
          `Suite clientIds not present in scenario catalog: ${missing.join(", ")}`
        );
      }
      return resolved;
    }
    case "smoke":
      return seededSample(allClientIds, parsed.sample, parsed.seed);
    default: {
      const _exhaustive: never = parsed;
      return _exhaustive;
    }
  }
}

/**
 * Builds a full suite resolution (ids + finality + default scorer mode).
 */
export function resolveSuite(
  selection: SuiteSelection,
  allClientIds: readonly string[],
  canaryClientIds: ReadonlySet<string> = CANARY_CLIENT_IDS
): SuiteResolution {
  const parsed = suiteSelectionSchema.parse(selection);
  const clientIds = resolveSuiteClientIds(
    parsed,
    allClientIds,
    canaryClientIds
  );
  if (parsed.mode === "canary" && clientIds.length === 0) {
    throw new Error(
      "Suite mode \"canary\" resolved to zero scenarios — check GROUND_TRUTH canary flags / approved goldens."
    );
  }
  if (parsed.mode === "smoke" && clientIds.length === 0) {
    throw new Error(
      "Suite mode \"smoke\" resolved to zero scenarios — empty catalog or invalid sample."
    );
  }
  return {
    selection: parsed,
    clientIds,
    isFinal: isFinalSuite(parsed),
    defaultScorerMode: defaultScorerModeForSuite(parsed),
  };
}

/**
 * Throws when a non-final suite is asked to enforce release / ship gates.
 * REGULATORY: smoke must never be the release score.
 */
export function assertSuiteAllowsReleaseGate(
  selection: SuiteSelection
): void {
  if (!isFinalSuite(selection)) {
    throw new Error(
      `Suite mode "${selection.mode}" is non-final — cannot enforce release or canary ship gates on smoke/sample runs. Use --suite canary or --suite full.`
    );
  }
}

/**
 * Fail closed: refuse full-suite live evals in CI unless explicitly opted in.
 * Default CI stays canary or fixture-unit ($0 OpenRouter).
 * Pass `options` in unit tests to avoid depending on process env.
 */
export function assertFullSuiteAllowedInCi(
  selection: SuiteSelection,
  options?: { ci?: boolean; allowFullInCi?: boolean }
): void {
  if (selection.mode !== "full") return;
  const ci = options?.ci ?? env.CI;
  const allowFullInCi = options?.allowFullInCi ?? env.EVAL_ALLOW_FULL_IN_CI;
  if (!ci) return;
  if (allowFullInCi) return;
  throw new Error(
    "Refusing suite mode \"full\" under CI without EVAL_ALLOW_FULL_IN_CI=true. " +
      "Default CI must not run full×live — use --suite canary, fixture unit tests, or set EVAL_ALLOW_FULL_IN_CI=1 for an explicit nightly job."
  );
}

/**
 * Parses CLI argv into a suite selection.
 * Precedence: `--client-ids` > `--suite` > `--canary-ci` (compat) > default `full`.
 */
export function parseSuiteSelectionFromArgs(
  args: readonly string[]
): SuiteSelection {
  const clientIdsIdx = args.indexOf("--client-ids");
  if (clientIdsIdx !== -1) {
    const raw = args[clientIdsIdx + 1];
    if (!raw || raw.startsWith("--")) {
      throw new Error("--client-ids requires a comma-separated list");
    }
    const clientIds = raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return suiteSelectionSchema.parse({ mode: "clientIds", clientIds });
  }

  const suiteIdx = args.indexOf("--suite");
  if (suiteIdx !== -1) {
    const name = args[suiteIdx + 1];
    if (!name || name.startsWith("--")) {
      throw new Error("--suite requires canary|full|smoke");
    }
    if (name === "smoke") {
      const sampleIdx = args.indexOf("--sample");
      const seedIdx = args.indexOf("--sample-seed");
      const sampleRaw = sampleIdx !== -1 ? args[sampleIdx + 1] : "5";
      const seed =
        seedIdx !== -1 && args[seedIdx + 1] && !args[seedIdx + 1]!.startsWith("--")
          ? args[seedIdx + 1]!
          : "cerebro-smoke";
      const sample = parseInt(sampleRaw ?? "5", 10);
      if (!Number.isFinite(sample) || sample < 1) {
        throw new Error("--sample must be a positive integer");
      }
      return suiteSelectionSchema.parse({ mode: "smoke", sample, seed });
    }
    if (name === "canary" || name === "full") {
      return suiteSelectionSchema.parse({ mode: name });
    }
    throw new Error(
      `Unknown --suite "${name}". Expected canary|full|smoke (or use --client-ids).`
    );
  }

  if (args.includes("--canary-ci")) {
    return { mode: "canary" };
  }

  return { mode: "full" };
}
