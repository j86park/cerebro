import { describe, expect, it } from "vitest";
import {
  canaryPartitionIsStratified,
  listCanaryScenarioMeta,
} from "@/evals/canary-strata";
import { CANARY_CLIENT_IDS } from "@/evals/ground-truth";

describe("canary strata partition", () => {
  it("assigns distinct strata to every GROUND_TRUTH canary", () => {
    const meta = listCanaryScenarioMeta();
    expect(meta.map((m) => m.clientId).sort()).toEqual([...CANARY_CLIENT_IDS].sort());
    const strata = new Set(meta.map((m) => m.stratum));
    expect(strata.size).toBe(meta.length);
    expect(strata.has("onboarding_day1")).toBe(true);
    expect(strata.has("escalation_ladder")).toBe(true);
    expect(strata.has("compliant_forbidden_tools")).toBe(true);
  });

  it("covers both agent types with stratified canaries", () => {
    expect(canaryPartitionIsStratified()).toBe(true);
  });
});
