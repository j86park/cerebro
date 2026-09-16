import { describe, expect, it } from "vitest";
import { GROUND_TRUTH } from "@/evals/ground-truth";
import { extractToolNamesFromOutput } from "@/evals/scorers/extract-tool-names";
import { scoreTrajectory } from "@/evals/scorers/score-trajectory";
import { trajectoryScorer } from "@/evals/scorers/trajectory";

describe("extractToolNamesFromOutput", () => {
  it("reads toolCalls array", () => {
    expect(
      extractToolNamesFromOutput({
        toolCalls: [
          { name: "getDocumentComplianceStatus" },
          { name: "escalateToManagement" },
        ],
      })
    ).toEqual(["getDocumentComplianceStatus", "escalateToManagement"]);
  });

  it("reads nested steps[].toolCalls", () => {
    expect(
      extractToolNamesFromOutput({
        steps: [
          { toolCalls: [{ toolName: "getOnboardingStatus" }] },
          { toolCalls: [{ name: "requestDocument" }] },
        ],
      })
    ).toEqual(["getOnboardingStatus", "requestDocument"]);
  });
});

describe("scoreTrajectory", () => {
  it("passes when expected tools present and forbidden absent", () => {
    const res = scoreTrajectory(
      ["getDocumentComplianceStatus", "escalateToManagement", "logAction"],
      {
        expectedTools: ["getDocumentComplianceStatus", "escalateToManagement"],
        forbiddenTools: ["completeOnboarding"],
        maxSteps: 12,
      }
    );
    expect(res.score).toBe(1);
  });

  it("fails when a forbidden tool is used even if expected tools and end-state look correct", () => {
    // Lucky path: called escalateToManagement (correct outcome tool) BUT also
    // completeOnboarding (forbidden) — must fail trajectory.
    const res = scoreTrajectory(
      [
        "getDocumentComplianceStatus",
        "completeOnboarding",
        "escalateToManagement",
      ],
      {
        expectedTools: ["getDocumentComplianceStatus", "escalateToManagement"],
        forbiddenTools: ["completeOnboarding"],
      }
    );
    expect(res.score).toBe(0);
    expect(res.reason).toMatch(/Forbidden tool/);
  });

  it("fails when expected tool sequence is wrong order", () => {
    const res = scoreTrajectory(
      ["escalateToManagement", "getDocumentComplianceStatus"],
      {
        expectedToolSequence: [
          "getDocumentComplianceStatus",
          "escalateToManagement",
        ],
      }
    );
    expect(res.score).toBe(0);
    expect(res.reason).toMatch(/sequence/);
  });

  it("fails when step budget exceeded", () => {
    const res = scoreTrajectory(
      ["a", "b", "c", "d"],
      { maxSteps: 3, expectedTools: ["a"] }
    );
    expect(res.score).toBe(0);
    expect(res.reason).toMatch(/Step budget/);
  });

  it("returns 1 when no golden is defined", () => {
    expect(scoreTrajectory(["anything"], undefined).score).toBe(1);
  });
});

describe("trajectoryScorer (Mastra)", () => {
  it("hard-fails fixture with correct escalation action text but forbidden toolCalls", async () => {
    const clt003 = GROUND_TRUTH.find((g) => g.clientId === "CLT-003");
    expect(clt003?.expected.trajectory).toBeDefined();

    // Outcome scorers would see ESCALATE_MANAGEMENT via tool name map —
    // trajectory must still fail because completeOnboarding is forbidden.
    const output = {
      text: "Escalated to management. ESCALATE_MANAGEMENT recorded.",
      toolCalls: [
        { name: "getDocumentComplianceStatus" },
        { name: "completeOnboarding" },
        { name: "escalateToManagement" },
      ],
    };

    const res = await trajectoryScorer.run({
      output,
      groundTruth: clt003!.expected,
    } as never);

    expect(res.score).toBe(0);
    expect(String(res.reason ?? "")).toMatch(/Forbidden|completeOnboarding/i);
  });

  it("passes CLT-003 when observe → escalate path is clean", async () => {
    const clt003 = GROUND_TRUTH.find((g) => g.clientId === "CLT-003");
    const output = {
      text: "ESCALATE_MANAGEMENT",
      toolCalls: [
        { name: "getDocumentComplianceStatus" },
        { name: "escalateToManagement" },
        { name: "logAction" },
      ],
    };

    const res = await trajectoryScorer.run({
      output,
      groundTruth: clt003!.expected,
    } as never);

    expect(res.score).toBe(1);
  });

  it("fails CLT-005 clean vault when escalation tools fire", async () => {
    const clt005 = GROUND_TRUTH.find((g) => g.clientId === "CLT-005");
    const output = {
      text: "SCAN_VAULT then accidentally alerted",
      toolCalls: [
        { name: "getClientProfile" },
        { name: "getActionHistory" },
        { name: "getDocumentComplianceStatus" },
        { name: "sendAdvisorAlert" },
      ],
    };

    const res = await trajectoryScorer.run({
      output,
      groundTruth: clt005!.expected,
    } as never);

    expect(res.score).toBe(0);
  });
});
