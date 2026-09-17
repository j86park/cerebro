import { describe, expect, it } from "vitest";
import { env } from "@/lib/config";

/**
 * Opt-in live OpenRouter lane placeholder (cheap-eval PR0).
 * Excluded from default `npm test`; run with `npm run test:live-eval`.
 * PR0 keeps this smoke at $0 — no generateText / agent.generate here.
 */
describe("live-eval lane (opt-in)", () => {
  it("requires CI_LIVE_EVAL=1", () => {
    expect(env.CI_LIVE_EVAL).toBe(true);
  });
});
