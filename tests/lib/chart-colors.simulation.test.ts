import { describe, expect, it } from "vitest";
import { CHART_COLORS } from "@/lib/chart-colors";

/**
 * Contract for simulation A/B charts (frontend.mdc + gaps §7 / §9).
 * Components import these keys — do not duplicate hex values in chart JSX.
 */
describe("CHART_COLORS simulation palette", () => {
  it("defines agent vs baseline colors", () => {
    expect(CHART_COLORS.blue).toMatch(/^#/);
    expect(CHART_COLORS.gray).toMatch(/^#/);
    expect(CHART_COLORS.green).toMatch(/^#/);
  });
});
