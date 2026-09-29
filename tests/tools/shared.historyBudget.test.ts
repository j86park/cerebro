import { describe, expect, it, vi } from "vitest";
import type { VaultService } from "@/lib/db/vault-service";
import { buildGetActionHistory } from "@/tools/shared/getActionHistory";

describe("bounded action history for model context", () => {
  it("retains ladder and approval summary while limiting entries and reasoning", async () => {
    const date = new Date("2026-09-29T12:00:00.000Z");
    const effectiveDate = new Date("2026-05-01T12:00:00.000Z");
    const nextDate = new Date("2026-05-06T12:00:00.000Z");
    const actions = [
      ...Array.from({ length: 20 }, (_, index) => ({ id: `scan-${index}`, agentType: "COMPLIANCE",
        actionType: "SCAN_VAULT", trigger: "SCHEDULED", reasoning: "x".repeat(1000),
        outcome: "NO_ACTION", performedAt: date, effectiveAt: effectiveDate, nextScheduledAt: nextDate })),
      { id: "approved", agentType: "COMPLIANCE", actionType: "ESCALATE_COMPLIANCE",
        trigger: "MANUAL", reasoning: "Advisor approved Stage 4", outcome: "DRY_RUN",
        actor: "ADVISOR", reasonCodes: ["HITL_APPROVED"], stage: 4,
        performedAt: date, effectiveAt: date, nextScheduledAt: null },
    ];
    const vault = { getActionHistory: vi.fn().mockResolvedValue(actions) } as unknown as VaultService;
    const tool = buildGetActionHistory(vault);
    const result = await (tool as unknown as { execute(input: { limit?: number }): Promise<{
      actions: Array<{ reasoning: string; performedAt: string; effectiveAt: string; nextScheduledAt: string | null }>;
      total: number; complianceLadderStage: number;
      approvedEscalationStages: number[];
    }> }).execute({});
    expect(result.actions).toHaveLength(6);
    expect(result.actions.every((action) => action.reasoning.length <= 200)).toBe(true);
    expect(result.actions[0]).toMatchObject({ performedAt: date.toISOString(),
      effectiveAt: effectiveDate.toISOString(), nextScheduledAt: nextDate.toISOString() });
    expect(result.total).toBe(21);
    expect(result.complianceLadderStage).toBe(5);
    expect(result.approvedEscalationStages).toEqual([4]);
    expect(await (tool as unknown as { execute(input: { limit: number }): Promise<unknown> }).execute({ limit: 100 }))
      .toMatchObject({ error: true });
  });
});
