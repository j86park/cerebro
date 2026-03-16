import { describe, expect, it, vi } from "vitest";

// Mock the prisma client and runSeed function
vi.mock("@/lib/db/client", () => ({
  prisma: {
    firm: { upsert: vi.fn().mockResolvedValue({}) },
    advisor: { upsert: vi.fn().mockResolvedValue({}) },
    client: { upsert: vi.fn().mockResolvedValue({}) },
    document: { upsert: vi.fn().mockResolvedValue({}) },
    agentAction: { upsert: vi.fn().mockResolvedValue({}) },
  }
}));

describe("Seed idempotency", () => {
  it("uses upsert for all seed operations instead of create to ensure idempotency", async () => {
    // We dynamically import runSeed to ensure the mock is active
    const { runSeed } = await import("../../prisma/seed");
    const { prisma } = await import("@/lib/db/client");
    
    await runSeed();
    
    // Assert that upsert was called for each model
    expect(prisma.firm.upsert).toHaveBeenCalled();
    expect(prisma.advisor.upsert).toHaveBeenCalled();
    expect(prisma.client.upsert).toHaveBeenCalled();
    expect(prisma.document.upsert).toHaveBeenCalled();
    expect(prisma.agentAction.upsert).toHaveBeenCalled();
    
    // Check that create was not called (it's not even mocked above, so it would throw if called)
    expect((prisma.firm as any).create).toBeUndefined();
  });
});
