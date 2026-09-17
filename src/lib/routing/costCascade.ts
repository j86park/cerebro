import { env } from "@/lib/config";
import {
  cascadeDecisionSchema,
  cascadeComplexityInputSchema,
  estimateCascadeComplexity,
  type CascadeComplexityInput,
  type CascadeDecision,
  type CascadeExecutionMode,
} from "./schemas";

export type {
  CascadeComplexity,
  CascadeComplexityInput,
  CascadeDecision,
  CascadeExecutionMode,
} from "./schemas";

export {
  cascadeComplexityInputSchema,
  cascadeComplexitySchema,
  cascadeDecisionSchema,
  cascadeExecutionModeSchema,
  estimateCascadeComplexity,
} from "./schemas";

/**
 * Whether hybrid cost cascade is enabled (default false — worker path unchanged).
 */
export function isHybridCostCascadeEnabled(): boolean {
  return env.HYBRID_COST_CASCADE;
}

/**
 * Chooses SAS vs MAS-specialists vs human escalate from complexity + budget.
 * Pure rules — no OpenRouter; never overrides REGULATORY policy allow/deny.
 */
export function chooseExecutionMode(input: {
  complexity?: CascadeComplexityInput;
  budgetUsdRemaining: number;
  priorHardFail?: boolean;
}): CascadeDecision {
  const budgetUsdRemaining = zNonNeg(input.budgetUsdRemaining);
  const complexityInput = cascadeComplexityInputSchema.parse({
    trigger: input.complexity?.trigger ?? "scan",
    documentCount: input.complexity?.documentCount ?? 0,
    openEscalationCount: input.complexity?.openEscalationCount ?? 0,
    priorHardFail:
      input.priorHardFail ?? input.complexity?.priorHardFail ?? false,
  });

  const complexity = estimateCascadeComplexity(complexityInput);

  if (budgetUsdRemaining <= 0) {
    return cascadeDecisionSchema.parse({
      mode: "escalate_human" satisfies CascadeExecutionMode,
      complexity,
      reason: "budgetUsdRemaining=0 — hold for human / cheap SAS path only (no model spend)",
      budgetUsdRemaining,
    });
  }

  if (complexityInput.priorHardFail) {
    return cascadeDecisionSchema.parse({
      mode: "escalate_human",
      complexity,
      reason: "priorHardFail — escalate_human; do not spawn debate MAS",
      budgetUsdRemaining,
    });
  }

  if (complexity === "high" && budgetUsdRemaining < 0.5) {
    return cascadeDecisionSchema.parse({
      mode: "sas_single",
      complexity,
      reason: "high complexity but thin budget — prefer sas_single specialist, not MAS fan-out",
      budgetUsdRemaining,
    });
  }

  if (complexity === "high") {
    return cascadeDecisionSchema.parse({
      mode: "mas_specialists",
      complexity,
      reason: "high complexity with budget — route Compliance|Onboarding specialists (bounded MAS, no debate)",
      budgetUsdRemaining,
    });
  }

  if (complexity === "medium") {
    return cascadeDecisionSchema.parse({
      mode: "mas_specialists",
      complexity,
      reason: "medium complexity — keep existing two-agent specialist routing",
      budgetUsdRemaining,
    });
  }

  return cascadeDecisionSchema.parse({
    mode: "sas_single",
    complexity,
    reason: "low complexity — single specialist (SAS) is enough",
    budgetUsdRemaining,
  });
}

function zNonNeg(n: number): number {
  if (typeof n !== "number" || Number.isNaN(n) || n < 0) {
    throw new Error(`budgetUsdRemaining must be a non-negative number, got ${String(n)}`);
  }
  return n;
}
