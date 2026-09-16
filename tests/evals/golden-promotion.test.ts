import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  exportSyntheticFailureCandidate,
  loadApprovedEvalScenarios,
  loadApprovedGoldens,
  promoteGoldenToApproved,
  readApprovedManifest,
  resolveGoldenRoots,
  writeFailureCandidate,
  type GoldenRoots,
} from "@/evals/golden";
import { scoreTrajectory } from "@/evals/scorers/score-trajectory";
import { assertCanaryHardGates, EvalHardGateError } from "@/evals/hard-gates";
import { FORBIDDEN_ONBOARDING_SIDE_EFFECTS } from "@/evals/trajectory-golden";

describe("WP-P1.5 failure → golden promotion", () => {
  let tmpRoot: string;
  let roots: GoldenRoots;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cerebro-golden-"));
    roots = resolveGoldenRoots(tmpRoot);
    await fs.mkdir(roots.candidatesDir, { recursive: true });
    await fs.mkdir(roots.approvedDir, { recursive: true });
    await fs.writeFile(
      roots.manifestPath,
      `${JSON.stringify({ files: [] }, null, 2)}\n`,
      "utf8"
    );
  });

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it("unapproved pending candidates never enter the ship-gate loader", async () => {
    const candidate = exportSyntheticFailureCandidate({
      candidateId: "cand-pending-001",
      clientId: "GOLD-SYN-001",
      agentType: "COMPLIANCE",
      observedToolNames: [
        "getDocumentComplianceStatus",
        "completeOnboarding",
        "escalateToManagement",
      ],
      draftScenario: {
        clientId: "GOLD-SYN-001",
        agentType: "COMPLIANCE",
        trigger: "SCHEDULED",
        canary: true,
        expected: {
          actionTaken: "ESCALATE_MANAGEMENT",
          escalationStage: 5,
          duplicateAction: false,
          highestPriority: "CRITICAL",
          trajectory: {
            expectedTools: [
              "getDocumentComplianceStatus",
              "escalateToManagement",
            ],
            forbiddenTools: [...FORBIDDEN_ONBOARDING_SIDE_EFFECTS],
            maxSteps: 12,
          },
        },
      },
    });

    await writeFailureCandidate(candidate, roots);

    const loaded = await loadApprovedEvalScenarios(roots);
    expect(loaded.map((s) => s.clientId)).not.toContain("GOLD-SYN-001");
    expect(await loadApprovedGoldens(roots)).toEqual([]);
    expect((await readApprovedManifest(roots)).files).toEqual([]);
  });

  it("DRY_RUN promote returns payload but does not write approved/ or manifest", async () => {
    const candidate = exportSyntheticFailureCandidate({
      candidateId: "cand-dry-001",
      clientId: "GOLD-SYN-DRY",
      agentType: "COMPLIANCE",
      observedToolNames: ["completeOnboarding"],
    });
    await writeFailureCandidate(candidate, roots);

    const result = await promoteGoldenToApproved({
      candidateId: "cand-dry-001",
      approve: true,
      approvedBy: "test-operator",
      regulatoryConfirmed: true,
      dryRun: true,
      roots,
    });

    expect(result.dryRun).toBe(true);
    expect(result.written).toBe(false);
    expect(result.filePath).toBeNull();
    expect(result.golden.approved).toBe(true);
    expect(await loadApprovedEvalScenarios(roots)).toEqual([]);
    expect((await readApprovedManifest(roots)).files).toEqual([]);
  });

  it("refuses promote without regulatoryConfirmed", async () => {
    const candidate = exportSyntheticFailureCandidate({
      candidateId: "cand-reg-001",
      clientId: "GOLD-SYN-REG",
      agentType: "COMPLIANCE",
      observedToolNames: ["completeOnboarding"],
    });
    await writeFailureCandidate(candidate, roots);

    await expect(
      promoteGoldenToApproved({
        candidateId: "cand-reg-001",
        approve: true,
        approvedBy: "test-operator",
        // @ts-expect-error intentional — unsupervised regulatory skip must fail
        regulatoryConfirmed: false,
        dryRun: false,
        roots,
      })
    ).rejects.toThrow(/REGULATORY|regulatoryConfirmed/);
  });

  it("human-approved synthetic failure enters ship suite and hard-fails wrong-tool path", async () => {
    // Lucky end-state tools: escalate (correct) + completeOnboarding (forbidden).
    const observedWrongPath = [
      "getDocumentComplianceStatus",
      "completeOnboarding",
      "escalateToManagement",
    ];

    const candidate = exportSyntheticFailureCandidate({
      candidateId: "cand-syn-fail-001",
      clientId: "GOLD-SYN-FAIL",
      agentType: "COMPLIANCE",
      observedToolNames: observedWrongPath,
      draftScenario: {
        clientId: "GOLD-SYN-FAIL",
        agentType: "COMPLIANCE",
        trigger: "SCHEDULED",
        canary: true,
        expected: {
          actionTaken: "ESCALATE_MANAGEMENT",
          escalationStage: 5,
          duplicateAction: false,
          highestPriority: "CRITICAL",
          trajectory: {
            expectedTools: [
              "getDocumentComplianceStatus",
              "escalateToManagement",
            ],
            expectedToolSequence: [
              "getDocumentComplianceStatus",
              "escalateToManagement",
            ],
            forbiddenTools: [...FORBIDDEN_ONBOARDING_SIDE_EFFECTS],
            maxSteps: 12,
          },
        },
      },
      scores: {
        trajectoryScorer: {
          score: 0,
          reason: "Forbidden tool: completeOnboarding",
        },
        escalationStageScorer: { score: 1, reason: "lucky end-state" },
      },
    });

    await writeFailureCandidate(candidate, roots);

    // Still pending — not in ship gate.
    expect(await loadApprovedEvalScenarios(roots)).toEqual([]);

    const promoted = await promoteGoldenToApproved({
      candidateId: "cand-syn-fail-001",
      approve: true,
      approvedBy: "test-operator",
      regulatoryConfirmed: true,
      dryRun: false,
      roots,
    });

    expect(promoted.written).toBe(true);
    expect((await readApprovedManifest(roots)).files).toContain(
      "GOLD-SYN-FAIL.v1.json"
    );

    const shipScenarios = await loadApprovedEvalScenarios(roots);
    expect(shipScenarios).toHaveLength(1);
    expect(shipScenarios[0]?.clientId).toBe("GOLD-SYN-FAIL");
    expect(shipScenarios[0]?.canary).toBe(true);

    // Same wrong trajectory that was mined — must fail until agent is fixed.
    const traj = scoreTrajectory(
      observedWrongPath,
      shipScenarios[0]!.expected.trajectory!
    );
    expect(traj.score).toBe(0);
    expect(traj.reason).toMatch(/Forbidden tool/);

    // Hard gate treats this canary as a ship-gate failure.
    expect(() =>
      assertCanaryHardGates(
        {
          "GOLD-SYN-FAIL": {
            scores: {
              trajectoryScorer: { score: traj.score, reason: traj.reason },
              escalationStageScorer: { score: 1 },
              duplicateActionScorer: { score: 1 },
            },
          },
        },
        ["GOLD-SYN-FAIL"]
      )
    ).toThrow(EvalHardGateError);
  });

  it("append-only: refuses overwrite of an existing approved version file", async () => {
    const candidate = exportSyntheticFailureCandidate({
      candidateId: "cand-append-001",
      clientId: "GOLD-APPEND",
      agentType: "ONBOARDING",
      observedToolNames: ["escalateToManagement"],
    });
    await writeFailureCandidate(candidate, roots);

    await promoteGoldenToApproved({
      candidateId: "cand-append-001",
      approve: true,
      approvedBy: "test-operator",
      regulatoryConfirmed: true,
      dryRun: false,
      roots,
    });

    await expect(
      promoteGoldenToApproved({
        candidateId: "cand-append-001",
        approve: true,
        approvedBy: "test-operator",
        regulatoryConfirmed: true,
        dryRun: false,
        roots,
      })
    ).rejects.toThrow(/already exists|bump version/);
  });
});
