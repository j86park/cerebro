import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: vi.fn() };
  },
}));

vi.mock("@/lib/config", () => ({
  env: {
    DRY_RUN: true,
    RESEND_API_KEY: "test-key",
  },
}));

describe("sendTransactionalEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not call Resend when DRY_RUN is true", async () => {
    const { sendTransactionalEmail } = await import("@/lib/email/resend");
    const { Resend } = await import("resend");

    const result = await sendTransactionalEmail({
      to: "client@example.com",
      subject: "Hello",
      text: "Body",
    });

    expect(result.skipped).toBe(true);
    expect(result.id).toBe("dry-run");
    expect(Resend).toBeDefined();
  });
});
