import { describe, expect, it, vi } from "vitest";

vi.mock("bullmq", () => {
  return {
    Queue: class {
      name: string;
      constructor(name: string) {
        this.name = name;
      }
    },
  };
});
vi.mock("ioredis", () => ({
  default: class RedisMock {
    on = vi.fn();
  },
}));

describe("Queue Separation", () => {
  it("defines the exact three canonical queues per architecture.md", async () => {
    const { queues } = await import("@/lib/queue/client");
    
    expect(queues).toHaveProperty("priority");
    expect(queues.priority.name).toBe("cerebro-priority");
    
    expect(queues).toHaveProperty("scheduled");
    expect(queues.scheduled.name).toBe("cerebro-scheduled");
    
    expect(queues).toHaveProperty("simulation");
    expect(queues.simulation.name).toBe("cerebro-simulation");
  });
});
