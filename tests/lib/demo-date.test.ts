import { describe, expect, it, vi } from "vitest";
import {
  addDemoDays,
  daysUntilExpiry,
  demoNow,
  isExpired,
  isWithinRecencyYears,
} from "@/lib/dates/demo-date";

vi.mock("@/lib/config", () => ({
  env: {
    DEMO_DATE: "2026-03-14T00:00:00.000Z",
  },
}));

describe("demo-date helpers", () => {
  it("pins arithmetic to DEMO_DATE not wall clock", () => {
    expect(demoNow().toISOString()).toBe("2026-03-14T00:00:00.000Z");
    expect(addDemoDays(1).toISOString()).toBe("2026-03-15T00:00:00.000Z");
    expect(addDemoDays(-2).toISOString()).toBe("2026-03-12T00:00:00.000Z");
  });

  it("marks expiry on DEMO_DATE as expired (inclusive boundary)", () => {
    const asOf = demoNow();
    expect(isExpired(new Date("2026-03-14T00:00:00.000Z"), asOf)).toBe(true);
    expect(isExpired(new Date("2026-03-15T00:00:00.000Z"), asOf)).toBe(false);
    expect(daysUntilExpiry(new Date("2026-03-21T00:00:00.000Z"), asOf)).toBe(7);
  });

  it("enforces recency years against DEMO_DATE", () => {
    const asOf = demoNow();
    expect(
      isWithinRecencyYears(new Date("2025-03-14T00:00:00.000Z"), 1, asOf),
    ).toBe(true);
    expect(
      isWithinRecencyYears(new Date("2025-03-13T00:00:00.000Z"), 1, asOf),
    ).toBe(false);
  });
});
