import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  exportSyntheticFailureCandidate,
  isEligibleForCanaryHardGate,
  CANARY_PROMOTE_CRITERIA,
  promoteApprovedGoldenToTrajectoryFixture,
  promoteGoldenToApproved,
  resolveGoldenRoots,
  shouldStagePromoteCandidate,
  stagePromoteCandidateFromOnlineSample,
  writeFailureCandidate,
  type GoldenRoots,
} from "@/evals/golden";

describe("cheap-eval PR5 promote queue + canary criteria + fixture bridge", () => {
  let tmpRoot: string;
  let roots: GoldenRoots;
  let fixturesDir: string;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cerebro-pr5-"));
    roots = resolveGoldenRoots(tmpRoot);
    fixturesDir = path.join(tmpRoot, "fixtures");
    await fs.mkdir(roots.candidatesDir, { recursive: true });
    await fs.mkdir(roots.approvedDir, { recursive: true });
    await fs.mkdir(fixturesDir, { recursive: true });
    await fs.writeFile(
      roots.manifestPath,
      `${JSON.stringify({ files: [] }, null, 2)}\n`,
      "utf8",
    );
  });

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it("CANARY_PROMOTE_CRITERIA documents human + REGULATORY gates", () => {
    expect(CANARY_PROMOTE_CRITERIA.humanApproved).toBe(true);
    expect(CANARY_PROMOTE_CRITERIA.regulatoryConfirmed).toBe(true);
    expect(CANARY_PROMOTE_CRITERIA.onlineSampleIsNotShipGate).toBe(true);
    expect(
      isEligibleForCanaryHardGate({
        canary: true,
        regulatoryConfirmed: true,
        humanApproved: true,
      }),
    ).toBe(true);
    expect(
      isEligibleForCanaryHardGate({
        canary: false,
        regulatoryConfirmed: true,
        humanApproved: true,
      }),
    ).toBe(false);
  });

  it("shouldStagePromoteCandidate: failure_weighted always; uniform only on soft fail", () => {
    expect(
      shouldStagePromoteCandidate({
        stream: "failure_weighted",
        verdict: { score: 1, verdict: "pass", reason: "ok" },
      }),
    ).toBe(true);
    expect(
      shouldStagePromoteCandidate({
        stream: "uniform",
        verdict: { score: 1, verdict: "pass", reason: "ok" },
      }),
    ).toBe(false);
    expect(
      shouldStagePromoteCandidate({
        stream: "uniform",
        verdict: { score: 0, verdict: "fail", reason: "bad" },
      }),
    ).toBe(true);
    expect(
      shouldStagePromoteCandidate({
        stream: "uniform",
        verdict: { score: 0, verdict: "NEEDS_REVIEW", reason: "thin" },
      }),
    ).toBe(true);
    expect(
      shouldStagePromoteCandidate({ stream: "uniform", verdict: null }),
    ).toBe(false);
  });

  it("stagePromoteCandidateFromOnlineSample writes pending candidate only", async () => {
    const staged = await stagePromoteCandidateFromOnlineSample({
      clientId: "GOLD-OJ-001",
      agentType: "COMPLIANCE",
      sourceJobId: "scan:GOLD-OJ-001:demo",
      toolNames: ["completeOnboarding"],
      stream: "failure_weighted",
      isFailureSignal: true,
      roots,
    });
    expect(staged.staged).toBe(true);
    if (!staged.staged) return;

    const raw = await fs.readFile(
      path.join(roots.candidatesDir, `${staged.candidateId}.json`),
      "utf8",
    );
    const parsed = JSON.parse(raw) as { approvalStatus: string };
    expect(parsed.approvalStatus).toBe("pending");

    const manifest = JSON.parse(
      await fs.readFile(roots.manifestPath, "utf8"),
    ) as { files: string[] };
    expect(manifest.files).toEqual([]);
  });

  it("fixture bridge dry-run returns payload without writing", async () => {
    const candidate = exportSyntheticFailureCandidate({
      candidateId: "cand-bridge-1",
      clientId: "GOLD-BRIDGE-001",
      agentType: "COMPLIANCE",
      observedToolNames: ["getDocumentComplianceStatus"],
      draftScenario: {
        clientId: "GOLD-BRIDGE-001",
        agentType: "COMPLIANCE",
        trigger: "SCHEDULED",
        canary: true,
        expected: {
          actionTaken: "SCAN_VAULT",
          duplicateAction: false,
          trajectory: {
            expectedTools: [
              "getDocumentComplianceStatus",
              "sendAdvisorAlert",
            ],
            maxSteps: 8,
          },
        },
      },
    });
    await writeFailureCandidate(candidate, roots);

    const promoted = await promoteGoldenToApproved({
      candidateId: "cand-bridge-1",
      approve: true,
      approvedBy: "tester",
      regulatoryConfirmed: true,
      dryRun: true,
      roots,
    });

    const bridge = await promoteApprovedGoldenToTrajectoryFixture({
      golden: promoted.golden,
      dryRun: true,
      fixturesDir,
    });

    expect(bridge.written).toBe(false);
    expect(bridge.fixture.kind).toBe("golden-pass");
    expect(bridge.fixture.scenarioId).toBe("GOLD-BRIDGE-001");
    expect(bridge.fixture.toolNames).toEqual([
      "getDocumentComplianceStatus",
      "sendAdvisorAlert",
    ]);
    const listing = await fs.readdir(fixturesDir);
    expect(listing).toEqual([]);
  });

  it("fixture bridge writes append-only golden-pass under fixturesDir", async () => {
    const candidate = exportSyntheticFailureCandidate({
      candidateId: "cand-bridge-2",
      clientId: "GOLD-BRIDGE-002",
      agentType: "ONBOARDING",
      observedToolNames: ["escalateToManagement"],
      draftScenario: {
        clientId: "GOLD-BRIDGE-002",
        agentType: "ONBOARDING",
        trigger: "SCHEDULED",
        canary: true,
        expected: {
          actionTaken: "REQUEST_DOCUMENT",
          duplicateAction: false,
          trajectory: {
            expectedTools: ["getOnboardingStatus", "requestDocument"],
            maxSteps: 6,
          },
        },
      },
    });
    await writeFailureCandidate(candidate, roots);

    const promoted = await promoteGoldenToApproved({
      candidateId: "cand-bridge-2",
      approve: true,
      approvedBy: "tester",
      regulatoryConfirmed: true,
      dryRun: false,
      roots,
    });
    expect(promoted.written).toBe(true);

    const bridge = await promoteApprovedGoldenToTrajectoryFixture({
      golden: promoted.golden,
      dryRun: false,
      fixturesDir,
    });
    expect(bridge.written).toBe(true);
    expect(bridge.filePath).toContain("gold-bridge-002-pass.json");

    const onDisk = JSON.parse(
      await fs.readFile(bridge.filePath!, "utf8"),
    ) as { fixtureId: string; kind: string };
    expect(onDisk.fixtureId).toBe("gold-bridge-002-pass");
    expect(onDisk.kind).toBe("golden-pass");

    await expect(
      promoteApprovedGoldenToTrajectoryFixture({
        golden: promoted.golden,
        dryRun: false,
        fixturesDir,
      }),
    ).rejects.toThrow(/already exists/);
  });
});
