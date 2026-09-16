import { describe, expect, it } from "vitest";
import {
  agentJobSchema,
  hitlResumeJobSchema,
  hitlTimeoutJobSchema,
  isHitlQueueJob,
  buildHitlResumeJobId,
  buildHitlTimeoutJobId,
} from "@/lib/queue/jobs";
import {
  buildHitlOpenKey,
  buildHitlResumeJobId as buildResumeId,
  advisorDecisionRequestSchema,
} from "@/lib/hitl";

describe("HITL queue job schemas", () => {
  it("validates hitl_resume payloads and deterministic jobIds", () => {
    const payload = {
      kind: "hitl_resume" as const,
      clientId: "CLT-1",
      workflowRunId: "run-abc",
      workflowId: "complianceHitlApproval" as const,
      openKey: buildHitlOpenKey("escalateToComplianceOfficer", 4),
      decision: "approve" as const,
      advisorId: "ADV-1",
    };

    expect(hitlResumeJobSchema.safeParse(payload).success).toBe(true);
    expect(isHitlQueueJob(payload)).toBe(true);
    expect(buildHitlResumeJobId(payload)).toBe("hitl-resume:run-abc:approve");
    expect(buildResumeId(payload)).toBe("hitl-resume:run-abc:approve");
  });

  it("validates hitl_timeout payloads (SAFE_HOLD path — never auto-approve)", () => {
    const payload = {
      kind: "hitl_timeout" as const,
      clientId: "CLT-1",
      workflowRunId: "run-abc",
      workflowId: "complianceHitlApproval" as const,
      openKey: "hitl:escalateToComplianceOfficer:stage-4",
    };

    expect(hitlTimeoutJobSchema.safeParse(payload).success).toBe(true);
    expect(isHitlQueueJob(payload)).toBe(true);
    expect(buildHitlTimeoutJobId(payload.workflowRunId)).toBe(
      "hitl-timeout:run-abc:timeout",
    );
    expect(buildHitlTimeoutJobId(payload.workflowRunId).split(":")).toHaveLength(
      3,
    );
  });

  it("does not treat agent jobs as HITL jobs", () => {
    const agent = {
      clientId: "CLT-1",
      agentType: "COMPLIANCE" as const,
      trigger: "MANUAL" as const,
    };
    expect(agentJobSchema.safeParse(agent).success).toBe(true);
    expect(isHitlQueueJob(agent)).toBe(false);
  });

  it("validates advisor decision API payloads", () => {
    expect(
      advisorDecisionRequestSchema.safeParse({
        clientId: "CLT-1",
        openKey: "hitl:escalateToComplianceOfficer:stage-4",
        decision: "deny",
      }).success,
    ).toBe(true);

    expect(
      advisorDecisionRequestSchema.safeParse({
        clientId: "CLT-1",
        openKey: "hitl:x",
        decision: "timeout",
      }).success,
    ).toBe(false);
  });
});
