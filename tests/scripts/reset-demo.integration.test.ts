import { describe, expect, it, vi, beforeEach } from "vitest";

const deleteMany = vi.fn().mockResolvedValue({});
const updateManyDoc = vi.fn().mockResolvedValue({});
const updateManyClient = vi.fn().mockResolvedValue({});
const disconnect = vi.fn();

vi.mock("@/lib/db/client", () => ({
  prisma: {
    agentAction: { deleteMany },
    document: { updateMany: updateManyDoc },
    client: { updateMany: updateManyClient },
    $disconnect: disconnect,
  },
}));

const runSeed = vi.fn().mockResolvedValue(undefined);
vi.mock("../../prisma/seed", () => ({
  runSeed,
}));

describe("reset-demo script contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes runtime actions, resets documents and clients, then re-seeds", async () => {
    const { resetDemo } = await import("../../scripts/reset-demo");
    await resetDemo();

    expect(deleteMany).toHaveBeenCalledWith({
      where: { NOT: { outcome: "SEEDED_HISTORY" } },
    });

    expect(updateManyDoc).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "MISSING",
          notificationCount: 0,
        }),
      })
    );

    expect(updateManyClient).toHaveBeenCalled();
    expect(runSeed).toHaveBeenCalled();
  });
});
