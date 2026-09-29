import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();
const updateMany = vi.fn();
const findUniqueOrThrow = vi.fn();
const update = vi.fn();
const findMany = vi.fn();

vi.mock("@/lib/email/resend", () => ({ sendTransactionalEmail: (...args: unknown[]) => send(...args) }));
vi.mock("@/lib/db/client", () => ({ prisma: { reminderEmailOutbox: {
  updateMany: (...args: unknown[]) => updateMany(...args),
  findUniqueOrThrow: (...args: unknown[]) => findUniqueOrThrow(...args),
  update: (...args: unknown[]) => update(...args),
  findMany: (...args: unknown[]) => findMany(...args),
} } }));

import { deliverReminderEmail, retryPendingReminderEmails } from "@/lib/email/reminder-outbox";

describe("reminder email outbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateMany.mockResolvedValue({ count: 1 });
    findUniqueOrThrow.mockResolvedValue({ id: "out-1", recipient: "client@example.com",
      subject: "Reminder", body: "Please upload your ID", idempotencyKey: "reminder:doc-1:stage-2" });
    update.mockResolvedValue({});
  });

  it("keeps a failed send pending, then retries with the same provider idempotency key", async () => {
    send.mockRejectedValueOnce(new Error("temporary provider outage"))
      .mockResolvedValueOnce({ id: "provider-1", skipped: false });

    await expect(deliverReminderEmail("out-1")).rejects.toThrow("temporary provider outage");
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "PENDING" }),
    }));
    expect(await deliverReminderEmail("out-1")).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
    for (const call of send.mock.calls) {
      expect(call[0].idempotencyKey).toBe("reminder:doc-1:stage-2");
    }
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "SENT", providerId: "provider-1" }),
    }));
  });

  it("does not send when another worker already claimed the intent", async () => {
    updateMany.mockResolvedValue({ count: 0 });
    expect(await deliverReminderEmail("out-1")).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it("sweeps pending intents independently of agent cooldown", async () => {
    findMany.mockResolvedValue([{ id: "out-1" }]);
    send.mockResolvedValue({ id: "provider-1", skipped: false });
    expect(await retryPendingReminderEmails()).toBe(1);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 25 }));
  });
});
