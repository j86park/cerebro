import { describe, expect, it } from "vitest";
import { agentJobSchema, simulationJobSchema } from "@/lib/queue/jobs";

describe("Queue Job Schemas", () => {
  it("validates valid AgentJobPayload", () => {
    const valid = { clientId: "CLT-123", agentType: "COMPLIANCE", trigger: "SCHEDULED" };
    expect(agentJobSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects invalid AgentJobPayload", () => {
    const invalid = { clientId: "CLT-123", agentType: "UNKNOWN", trigger: "SCHEDULED" };
    expect(agentJobSchema.safeParse(invalid).success).toBe(false);
  });

  it("requires documentId for EVENT_UPLOAD", () => {
    expect(
      agentJobSchema.safeParse({
        clientId: "CLT-123",
        agentType: "ONBOARDING",
        trigger: "EVENT_UPLOAD",
      }).success
    ).toBe(false);
    expect(
      agentJobSchema.safeParse({
        clientId: "CLT-123",
        agentType: "ONBOARDING",
        trigger: "EVENT_UPLOAD",
        documentId: "doc-1",
      }).success
    ).toBe(true);
  });

  it("validates valid SimulationJobPayload", () => {
    const valid = { runId: "run-123", batchStart: 0, batchEnd: 50 };
    expect(simulationJobSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects invalid SimulationJobPayload", () => {
    const invalid = { runId: "run-123" }; // Missing required fields
    expect(simulationJobSchema.safeParse(invalid).success).toBe(false);
  });
});
