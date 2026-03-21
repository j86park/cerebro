import { describe, expect, it, vi, beforeEach } from "vitest";

const send = vi.fn().mockResolvedValue("ok");
const subscribe = vi.fn((cb: (s: string) => void) => {
  cb("SUBSCRIBED");
});
const removeChannel = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    channel: vi.fn(() => ({
      subscribe,
      send,
    })),
    removeChannel,
  })),
}));

vi.mock("@/lib/config", () => ({
  env: {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-test",
  },
}));

describe("emitAgentRunComplete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("broadcasts on cerebro-agent-run-complete when service role is configured", async () => {
    const { emitAgentRunComplete } = await import("@/lib/events/emit");

    await emitAgentRunComplete({
      clientId: "CLT-001",
      agentType: "COMPLIANCE",
      jobId: "job-1",
      success: true,
    });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "broadcast",
        event: "agent_run_complete",
        payload: expect.objectContaining({
          clientId: "CLT-001",
          agentType: "COMPLIANCE",
        }),
      })
    );
    expect(removeChannel).toHaveBeenCalled();
  });
});
