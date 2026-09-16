import { describe, expect, it, vi } from "vitest";
import {
  computeSlaMetrics,
  isEscalateActionType,
  isHitlTerminalReasonCodes,
  isHitlTimeoutReasonCodes,
} from "@/lib/ops/slaMetrics";

vi.mock("@/lib/config", () => ({
  env: {
    DRY_RUN: true,
    DEMO_DATE: "2026-03-14T00:00:00.000Z",
    DATABASE_URL: "postgresql://localhost:5432/cerebro_test",
    REDIS_URL: "redis://localhost:6379",
    NODE_ENV: "test",
  },
}));

describe("computeSlaMetrics", () => {
  it("computes escalation_rate and timeout_rate from fixtures without email", () => {
    const metrics = computeSlaMetrics({
      totalClients: 10,
      clientsWithEscalation: 2,
      pendingApprovals: 1,
      hitlDecisions: 4,
      hitlTimeouts: 1,
    });

    expect(metrics.escalation_rate).toBeCloseTo(0.2);
    expect(metrics.timeout_rate).toBeCloseTo(0.25);
    expect(metrics.pendingApprovals).toBe(1);
    expect(metrics.computedAt).toBe("2026-03-14T00:00:00.000Z");
  });

  it("returns zero rates when denominators are empty", () => {
    const metrics = computeSlaMetrics({
      totalClients: 0,
      clientsWithEscalation: 0,
      pendingApprovals: 0,
      hitlDecisions: 0,
      hitlTimeouts: 0,
    });
    expect(metrics.escalation_rate).toBe(0);
    expect(metrics.timeout_rate).toBe(0);
  });

  it("classifies escalate action types and HITL reason codes", () => {
    expect(isEscalateActionType("ESCALATE_COMPLIANCE")).toBe(true);
    expect(isEscalateActionType("SEND_CLIENT_REMINDER")).toBe(false);
    expect(isHitlTimeoutReasonCodes(["HITL_TIMEOUT", "SAFE_HOLD"])).toBe(true);
    expect(isHitlTerminalReasonCodes(["HITL_APPROVED"])).toBe(true);
    expect(isHitlTerminalReasonCodes(["POLICY_ALLOW"])).toBe(false);
  });
});
