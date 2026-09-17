import { describe, expect, it } from "vitest";
import {
  assertFixtureKindMatchesReplay,
  hashTrajectoryFixtureContent,
  loadAllTrajectoryFixtures,
  loadTrajectoryFixture,
  listTrajectoryFixtureIds,
  replayTrajectoryFixture,
  type TrajectoryFixture,
} from "@/evals/fixtures";

describe("cheap-eval PR0 trajectory fixtures ($0)", () => {
  it("lists and loads the versioned fixture bank", async () => {
    const ids = await listTrajectoryFixtureIds();
    expect(ids.length).toBeGreaterThanOrEqual(6);
    expect(ids).toContain("clt-003-pass");
    expect(ids).toContain("clt-003-defect-forbidden-tool");

    const fixture = await loadTrajectoryFixture("clt-003-pass");
    expect(fixture.scenarioId).toBe("CLT-003");
    expect(fixture.kind).toBe("golden-pass");
  });

  it("fails closed when a fixture id is missing (never vacuous pass)", async () => {
    await expect(loadTrajectoryFixture("does-not-exist")).rejects.toThrow(
      /missing|unreadable/i
    );
  });

  it("replays every bank fixture with kind-matching three-outcome semantics", async () => {
    const fixtures = await loadAllTrajectoryFixtures();
    expect(fixtures.length).toBeGreaterThanOrEqual(6);

    for (const fixture of fixtures) {
      const result = replayTrajectoryFixture(fixture);
      expect(result.outcome).not.toBe("diverged");
      assertFixtureKindMatchesReplay(fixture, result);
    }
  });

  it("marks content-hash mismatch as diverged (not pass)", () => {
    const fixture: TrajectoryFixture = {
      fixtureId: "clt-003-pass",
      scenarioId: "CLT-003",
      kind: "golden-pass",
      toolNames: [
        "getDocumentComplianceStatus",
        "escalateToManagement",
        "logAction",
      ],
      contentHash: "0".repeat(64),
    };

    const result = replayTrajectoryFixture(fixture);
    expect(result.outcome).toBe("diverged");
    expect(result.reason).toMatch(/hash mismatch/i);
  });

  it("marks unknown scenario as diverged", () => {
    const toolNames = ["getDocumentComplianceStatus"];
    const fixture: TrajectoryFixture = {
      fixtureId: "unknown-scenario",
      scenarioId: "CLT-DOES-NOT-EXIST",
      kind: "golden-pass",
      toolNames,
      contentHash: hashTrajectoryFixtureContent("CLT-DOES-NOT-EXIST", toolNames),
    };

    expect(replayTrajectoryFixture(fixture).outcome).toBe("diverged");
  });
});
