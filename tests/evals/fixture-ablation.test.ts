import { describe, expect, it } from "vitest";
import {
  assertLiveAblationAllowed,
  defaultPromptComponentsForGolden,
  isFixtureAblationInconclusive,
  listToolMaskCandidates,
  maskToolFromTrajectory,
  orderLiveLooBatchesByToolset,
  planBudgetedLiveCanaryLoo,
  resolveFixtureTrajectoryGolden,
  runFixtureToolMaskLoo,
  scorePromptComponentArm,
  scoreToolMaskArm,
  type FixtureLooReport,
  type LiveLooBatch,
} from "@/evals/fixture-ablation";
import { loadTrajectoryFixture } from "@/evals/fixtures";

describe("cheap-eval PR4 fixture tool-mask LOO ($0)", () => {
  it("masks all occurrences of a tool from a trajectory", () => {
    expect(
      maskToolFromTrajectory(
        ["a", "b", "a", "c"],
        "a",
        "all_occurrences"
      )
    ).toEqual(["b", "c"]);
    expect(
      maskToolFromTrajectory(["a", "b", "a"], "a", "first_occurrence")
    ).toEqual(["b", "a"]);
  });

  it("lists expected tools first then non-expected helpers", () => {
    const golden = resolveFixtureTrajectoryGolden("CLT-003");
    expect(golden).not.toBeNull();
    const candidates = listToolMaskCandidates(
      [
        "getDocumentComplianceStatus",
        "escalateToManagement",
        "logAction",
      ],
      golden
    );
    expect(candidates[0]).toBe("getDocumentComplianceStatus");
    expect(candidates).toContain("logAction");
  });

  it("marks escalateToManagement as load-bearing on clt-003-pass", async () => {
    const fixture = await loadTrajectoryFixture("clt-003-pass");
    const golden = resolveFixtureTrajectoryGolden("CLT-003");
    expect(golden).not.toBeNull();
    if (!golden) throw new Error("missing golden");

    const arm = scoreToolMaskArm({
      fixture,
      golden,
      maskedTool: "escalateToManagement",
    });
    expect(arm.baselineScore).toBe(1);
    expect(arm.maskedScore).toBe(0);
    expect(arm.loadBearing).toBe(true);
    expect(arm.maskedReason).toMatch(/Missing expected tool/i);
  });

  it("marks logAction as non-load-bearing on clt-003-pass", async () => {
    const fixture = await loadTrajectoryFixture("clt-003-pass");
    const golden = resolveFixtureTrajectoryGolden("CLT-003");
    expect(golden).not.toBeNull();
    if (!golden) throw new Error("missing golden");

    const arm = scoreToolMaskArm({
      fixture,
      golden,
      maskedTool: "logAction",
    });
    expect(arm.baselineScore).toBe(1);
    expect(arm.maskedScore).toBe(1);
    expect(arm.loadBearing).toBe(false);
  });

  it("runs bank golden-pass LOO at $0 OpenRouter with load-bearing tools", async () => {
    const report = await runFixtureToolMaskLoo();
    expect(report.mode).toBe("fixture");
    expect(report.openRouterSpendUsd).toBe(0);
    expect(report.fixtureCount).toBeGreaterThanOrEqual(3);
    expect(report.arms.length).toBeGreaterThan(0);
    expect(report.loadBearingTools).toContain("escalateToManagement");
    expect(report.loadBearingTools).toContain("requestDocument");
    expect(report.loadBearingTools).toContain("getDocumentComplianceStatus");
    expect(report.inconclusive).toBe(false);
  });

  it("scores optional prompt-component LOO on observe vs action clauses", async () => {
    const fixture = await loadTrajectoryFixture("clt-001-pass");
    const golden = resolveFixtureTrajectoryGolden("CLT-001");
    expect(golden).not.toBeNull();
    if (!golden) throw new Error("missing golden");

    const components = defaultPromptComponentsForGolden(golden);
    expect(components.map((c) => c.id)).toEqual([
      "observe-clause",
      "action-clause",
    ]);

    const observeArm = scorePromptComponentArm({
      fixture,
      golden,
      component: components[0]!,
    });
    const actionArm = scorePromptComponentArm({
      fixture,
      golden,
      component: components[1]!,
    });
    expect(observeArm.loadBearing).toBe(true);
    expect(actionArm.loadBearing).toBe(true);
  });

  it("detects inconclusive when no load-bearing tool arms exist", () => {
    expect(isFixtureAblationInconclusive([], 1)).toBe(true);
    expect(
      isFixtureAblationInconclusive(
        [
          {
            kind: "tool_mask",
            fixtureId: "x",
            scenarioId: "CLT-003",
            maskedTool: "logAction",
            maskMode: "all_occurrences",
            baselineScore: 1,
            maskedScore: 1,
            loadBearing: false,
            baselineReason: "ok",
            maskedReason: "ok",
            maskedToolNames: ["a"],
          },
        ],
        1
      )
    ).toBe(true);
  });

  it("refuses live LOO by default (keeps CI at $0)", () => {
    expect(() => assertLiveAblationAllowed()).toThrow(/EVAL_LIVE_ABLATION/);
  });

  it("orders live batches by shared toolset key", () => {
    const batches: LiveLooBatch[] = [
      {
        batchKey: "mask:b",
        maskedTool: "b",
        componentId: null,
        clientIds: ["CLT-003"],
        sessionId: "s-b",
      },
      {
        batchKey: "mask:a",
        maskedTool: "a",
        componentId: null,
        clientIds: ["CLT-003"],
        sessionId: "s-a",
      },
    ];
    expect(orderLiveLooBatchesByToolset(batches).map((b) => b.batchKey)).toEqual(
      ["mask:a", "mask:b"]
    );
  });

  it("refuses live plan when fixture LOO was conclusive", () => {
    const conclusive: FixtureLooReport = {
      mode: "fixture",
      openRouterSpendUsd: 0,
      fixtureCount: 1,
      arms: [],
      loadBearingTools: ["escalateToManagement"],
      loadBearingComponents: [],
      inconclusive: false,
    };
    expect(() =>
      planBudgetedLiveCanaryLoo({ fixtureReport: conclusive })
    ).toThrow(/EVAL_LIVE_ABLATION|conclusive/i);
  });
});
