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

  it("validates valid SimulationJobPayload", () => {
    const valid = { runId: "run-123", batchStart: 0, batchEnd: 50 };
    expect(simulationJobSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects invalid SimulationJobPayload", () => {
    const invalid = { runId: "run-123" }; // Missing required fields
    expect(simulationJobSchema.safeParse(invalid).success).toBe(false);
  });
});
