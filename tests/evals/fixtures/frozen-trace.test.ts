import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  frozenTraceFixtureSchema,
  hashFrozenTraceContent,
  replayFrozenTrace,
} from "@/evals/fixtures/frozenTrace";
import {
  createConfiguredExperimentSidecar,
  createNoopExperimentSidecar,
  getExperimentSidecar,
} from "@/lib/observability/experimentSidecar";

const tracesDir = join(
  process.cwd(),
  "src/evals/fixtures/traces",
);

function loadTrace(name: string) {
  const raw = JSON.parse(
    readFileSync(join(tracesDir, name), "utf8"),
  ) as unknown;
  return frozenTraceFixtureSchema.parse(raw);
}

describe("frozen-trace replay (SOTA P2.4 watch)", () => {
  it("pass fixture replays to pass when hash matches", () => {
    const fixture = loadTrace("frozen-trace-pass-reminder.json");
    const result = replayFrozenTrace(fixture);
    expect(result.outcome).toBe("pass");
    expect(result.fixtureId).toBe("frozen-trace-pass-reminder");
  });

  it("fail fixture with failed decision → fail (not diverged)", () => {
    const fixture = loadTrace("frozen-trace-fail-escalation.json");
    const result = replayFrozenTrace(fixture);
    expect(result.outcome).toBe("fail");
  });

  it("hash miss → diverged (never vacuous pass)", () => {
    const fixture = loadTrace("frozen-trace-pass-reminder.json");
    const tampered = {
      ...fixture,
      contentHash: "a".repeat(64),
    };
    const result = replayFrozenTrace(tampered);
    expect(result.outcome).toBe("diverged");
    expect(result.reason).toMatch(/hash mismatch/i);
  });

  it("hash helper is stable for canonical payload", () => {
    const fixture = loadTrace("frozen-trace-pass-reminder.json");
    expect(
      hashFrozenTraceContent({
        jobId: fixture.jobId,
        toolExecuted: fixture.toolExecuted,
        decisionOutcomes: fixture.decisionOutcomes,
      }),
    ).toBe(fixture.contentHash);
  });
});

describe("experiment sidecar (SOTA P2.4 watch)", () => {
  it("default getExperimentSidecar is noop / off", async () => {
    const sidecar = getExperimentSidecar();
    expect(sidecar.provider).toBe("off");
    await expect(
      sidecar.exportRun({ runId: "run-1", jobId: "job-1" }),
    ).resolves.toBe("skipped");
  });

  it("noop sidecar always skips", async () => {
    const sidecar = createNoopExperimentSidecar();
    await expect(
      sidecar.exportRun({ runId: "r", summary: "ok", scores: { hard: 1 } }),
    ).resolves.toBe("skipped");
  });

  it("braintrust stub skips under DRY_RUN (default CI)", async () => {
    const sidecar = createConfiguredExperimentSidecar("braintrust");
    await expect(
      sidecar.exportRun({ runId: "r2" }),
    ).resolves.toBe("skipped");
  });
});
