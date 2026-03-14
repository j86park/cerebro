import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";

describe("milestone 0 baseline scaffold", () => {
  it("has required root directories", () => {
    expect(existsSync("src")).toBe(true);
    expect(existsSync("prisma")).toBe(true);
    expect(existsSync("tests")).toBe(true);
    expect(existsSync("scripts")).toBe(true);
  });
});
