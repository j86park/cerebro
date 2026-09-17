import { describe, expect, it } from "vitest";
import { CANARY_CLIENT_IDS } from "@/evals/ground-truth";
import {
  assertFullSuiteAllowedInCi,
  assertSuiteAllowsReleaseGate,
  defaultScorerModeForSuite,
  hashSeedToUint32,
  isFinalSuite,
  parseSuiteSelectionFromArgs,
  resolveSuite,
  resolveSuiteClientIds,
  seededSample,
} from "@/evals/suite-modes";
import {
  loadAllTrajectoryFixtures,
  replayTrajectoryFixture,
} from "@/evals/fixtures";
import { computePassK } from "@/evals/pass-k";

const CATALOG = [
  "CLT-001",
  "CLT-002",
  "CLT-003",
  "CLT-004",
  "CLT-005",
  "CLT-006",
] as const;

describe("suite modes (canary / full / smoke)", () => {
  it("marks canary and full as final; smoke and clientIds as non-final", () => {
    expect(isFinalSuite({ mode: "canary" })).toBe(true);
    expect(isFinalSuite({ mode: "full" })).toBe(true);
    expect(
      isFinalSuite({ mode: "smoke", sample: 3, seed: "x" })
    ).toBe(false);
    expect(
      isFinalSuite({ mode: "clientIds", clientIds: ["CLT-001"] })
    ).toBe(false);
  });

  it("defaults scorer mode to canary-ci for canary and smoke", () => {
    expect(defaultScorerModeForSuite({ mode: "canary" })).toBe("canary-ci");
    expect(
      defaultScorerModeForSuite({ mode: "smoke", sample: 2, seed: "s" })
    ).toBe("canary-ci");
    expect(defaultScorerModeForSuite({ mode: "full" })).toBe("full");
  });

  it("resolves canary suite to stratified canary client ids only", () => {
    const ids = resolveSuiteClientIds({ mode: "canary" }, CATALOG);
    expect(ids.sort()).toEqual([...CANARY_CLIENT_IDS].sort());
    expect(ids.every((id) => CANARY_CLIENT_IDS.has(id))).toBe(true);
    expect(ids).not.toContain("CLT-002");
  });

  it("resolves full suite to the entire catalog", () => {
    expect(resolveSuiteClientIds({ mode: "full" }, CATALOG)).toEqual([
      ...CATALOG,
    ]);
  });

  it("seeded smoke is deterministic and capped", () => {
    const a = seededSample(CATALOG, 3, "cerebro-smoke");
    const b = seededSample(CATALOG, 3, "cerebro-smoke");
    const c = seededSample(CATALOG, 3, "other-seed");
    expect(a).toEqual(b);
    expect(a).toHaveLength(3);
    expect(new Set(a).size).toBe(3);
    expect(c).not.toEqual(a);
    expect(seededSample(CATALOG, 100, "cerebro-smoke")).toHaveLength(
      CATALOG.length
    );
  });

  it("hashSeedToUint32 is stable", () => {
    expect(hashSeedToUint32("cerebro-smoke")).toBe(
      hashSeedToUint32("cerebro-smoke")
    );
    expect(hashSeedToUint32("a")).not.toBe(hashSeedToUint32("b"));
  });

  it("refuses release gates on non-final smoke", () => {
    expect(() =>
      assertSuiteAllowsReleaseGate({
        mode: "smoke",
        sample: 5,
        seed: "x",
      })
    ).toThrow(/non-final/i);
    expect(() => assertSuiteAllowsReleaseGate({ mode: "canary" })).not.toThrow();
    expect(() => assertSuiteAllowsReleaseGate({ mode: "full" })).not.toThrow();
  });

  it("refuses full suite under CI without explicit opt-in", () => {
    expect(() =>
      assertFullSuiteAllowedInCi(
        { mode: "full" },
        { ci: true, allowFullInCi: false }
      )
    ).toThrow(/EVAL_ALLOW_FULL_IN_CI/i);
    expect(() =>
      assertFullSuiteAllowedInCi(
        { mode: "full" },
        { ci: true, allowFullInCi: true }
      )
    ).not.toThrow();
    expect(() =>
      assertFullSuiteAllowedInCi(
        { mode: "canary" },
        { ci: true, allowFullInCi: false }
      )
    ).not.toThrow();
    expect(() =>
      assertFullSuiteAllowedInCi(
        { mode: "full" },
        { ci: false, allowFullInCi: false }
      )
    ).not.toThrow();
  });

  it("parseSuiteSelectionFromArgs covers CLI flags", () => {
    expect(parseSuiteSelectionFromArgs(["--suite", "canary"])).toEqual({
      mode: "canary",
    });
    expect(parseSuiteSelectionFromArgs(["--canary-ci"])).toEqual({
      mode: "canary",
    });
    expect(
      parseSuiteSelectionFromArgs([
        "--suite",
        "smoke",
        "--sample",
        "4",
        "--sample-seed",
        "abc",
      ])
    ).toEqual({ mode: "smoke", sample: 4, seed: "abc" });
    expect(
      parseSuiteSelectionFromArgs(["--client-ids", "CLT-001, CLT-003"])
    ).toEqual({ mode: "clientIds", clientIds: ["CLT-001", "CLT-003"] });
    expect(parseSuiteSelectionFromArgs([])).toEqual({ mode: "full" });
  });

  it("resolveSuite labels finality and defaults", () => {
    const canary = resolveSuite({ mode: "canary" }, CATALOG);
    expect(canary.isFinal).toBe(true);
    expect(canary.defaultScorerMode).toBe("canary-ci");
    expect(canary.clientIds.length).toBeGreaterThanOrEqual(2);

    const smoke = resolveSuite(
      { mode: "smoke", sample: 2, seed: "s" },
      CATALOG
    );
    expect(smoke.isFinal).toBe(false);
    expect(smoke.clientIds).toHaveLength(2);
  });
});

describe("fixture multi-trial canary pass^k ($0)", () => {
  it("scores canary golden-pass fixtures as k identical hard-pass trials", async () => {
    const fixtures = await loadAllTrajectoryFixtures();
    const canaryIds = [...CANARY_CLIENT_IDS];
    const passByCanary = new Map<string, boolean[]>();

    for (const clientId of canaryIds) {
      const golden = fixtures.find(
        (f) => f.scenarioId === clientId && f.kind === "golden-pass"
      );
      expect(golden, `missing golden-pass fixture for ${clientId}`).toBeDefined();
      const outcome = replayTrajectoryFixture(golden!);
      expect(outcome.outcome).toBe("pass");
      // Fixture multi-trial: replay the same golden k times (deterministic $0).
      const k = 3;
      const trials = Array.from({ length: k }, () => outcome.outcome === "pass");
      expect(computePassK(trials, k)).toBe(true);
      passByCanary.set(clientId, trials);
    }

    expect(passByCanary.size).toBe(canaryIds.length);
  });
});
