import { describe, expect, it, vi, beforeEach } from "vitest";

const publish = vi.fn().mockResolvedValue(1);
vi.mock("@/lib/queue/client", () => ({ connection: { publish } }));

describe("emitAgentRunComplete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("publishes a local Redis completion signal", async () => {
    const { emitAgentRunComplete } = await import("@/lib/events/emit");

    await emitAgentRunComplete({
      clientId: "CLT-001",
      agentType: "COMPLIANCE",
      jobId: "job-1",
      success: true,
    });

    expect(publish).toHaveBeenCalledWith(
      "cerebro-agent-run-complete",
      JSON.stringify({
        clientId: "CLT-001",
        agentType: "COMPLIANCE",
        jobId: "job-1",
        success: true,
      }),
    );
  });
});
