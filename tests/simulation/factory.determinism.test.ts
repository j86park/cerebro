import { describe, it, expect } from "vitest";
import { EntityFactory } from "../../src/lib/simulation/factory";

describe("EntityFactory Determinism", () => {
  const baseDate = new Date("2026-03-16T12:00:00Z");

  it("should produce the same clients for the same seed", () => {
    const factory1 = new EntityFactory("seed-123", baseDate);
    const factory2 = new EntityFactory("seed-123", baseDate);

    const clients1 = factory1.generateClients(5);
    const clients2 = factory2.generateClients(5);

    expect(clients1).toEqual(clients2);
  });

  it("should produce different clients for different seeds", () => {
    const factory1 = new EntityFactory("seed-123", baseDate);
    const factory2 = new EntityFactory("seed-456", baseDate);

    const clients1 = factory1.generateClients(5);
    const clients2 = factory2.generateClients(5);

    expect(clients1).not.toEqual(clients2);
  });

  it("should produce consistent document distributions", () => {
    const factory = new EntityFactory("seed-123", baseDate);
    const documents1 = factory.generateDocuments("client-1", "MESSY");
    const documents2 = new EntityFactory("seed-123", baseDate).generateDocuments("client-1", "MESSY");

    expect(documents1).toEqual(documents2);
  });
});
