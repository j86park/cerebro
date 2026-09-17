import { describe, expect, it } from "vitest";
import {
  chooseExecutionMode,
  estimateCascadeComplexity,
  isHybridCostCascadeEnabled,
} from "@/lib/routing";

describe("costCascade (SOTA P2.7 watch)", () => {
  it("defaults disabled — worker path unchanged", () => {
    expect(isHybridCostCascadeEnabled()).toBe(false);
  });

  it("low complexity → sas_single", () => {
    expect(
      estimateCascadeComplexity({
        trigger: "scan",
        documentCount: 1,
      }),
    ).toBe("low");

    const decision = chooseExecutionMode({
      complexity: { trigger: "scan", documentCount: 1 },
      budgetUsdRemaining: 1,
    });
    expect(decision.mode).toBe("sas_single");
  });

  it("medium multi-doc → mas_specialists", () => {
    const decision = chooseExecutionMode({
      complexity: { trigger: "upload", documentCount: 5 },
      budgetUsdRemaining: 2,
    });
    expect(decision.complexity).toBe("medium");
    expect(decision.mode).toBe("mas_specialists");
  });

  it("budget 0 → escalate_human", () => {
    const decision = chooseExecutionMode({
      complexity: { trigger: "scan", documentCount: 1 },
      budgetUsdRemaining: 0,
    });
    expect(decision.mode).toBe("escalate_human");
  });

  it("priorHardFail → escalate_human (no debate MAS)", () => {
    const decision = chooseExecutionMode({
      complexity: {
        trigger: "scan",
        documentCount: 8,
        priorHardFail: true,
      },
      budgetUsdRemaining: 5,
    });
    expect(decision.mode).toBe("escalate_human");
    expect(decision.reason).toMatch(/priorHardFail/i);
  });
});
