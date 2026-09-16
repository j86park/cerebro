import { z } from "zod";
import { agentTriggerSchema, type AgentTrigger } from "@/lib/queue/jobs";

const pkycRouteInputSchema = z.object({
  trigger: agentTriggerSchema,
  /** Used only for EVENT_PROFILE_MATERIAL_CHANGE → Onboarding vs Compliance. */
  onboardingStatus: z.string().min(1).optional(),
});

export type PkycRouteInput = z.infer<typeof pkycRouteInputSchema>;

export type PkycRouteResult = {
  agentTypes: Array<"COMPLIANCE" | "ONBOARDING">;
  queue: "priority" | "scheduled";
};

/**
 * Deterministic pKYC / agent routing — never calls an LLM.
 * Maps event taxonomy triggers to Compliance vs Onboarding and priority vs scheduled queue.
 */
export function routePkycEvent(input: PkycRouteInput): PkycRouteResult {
  const parsed = pkycRouteInputSchema.parse(input);

  switch (parsed.trigger) {
    case "EVENT_EXPIRY_PROXIMITY":
    case "EVENT_RISK_TIER_CHANGE":
    case "EVENT_SANCTIONS_PEP":
      // REGULATORY: expiry / risk-tier / sanctions deltas are compliance mandates.
      return { agentTypes: ["COMPLIANCE"], queue: "priority" };

    case "EVENT_PROFILE_MATERIAL_CHANGE":
      // Open onboarding stays with Onboarding; completed vaults → Compliance refresh.
      if (
        parsed.onboardingStatus &&
        parsed.onboardingStatus !== "COMPLETED"
      ) {
        return { agentTypes: ["ONBOARDING"], queue: "priority" };
      }
      return { agentTypes: ["COMPLIANCE"], queue: "priority" };

    case "EVENT_UPLOAD":
      // Upload callers may enqueue both; default router picks Onboarding for intake.
      return { agentTypes: ["ONBOARDING"], queue: "priority" };

    case "MANUAL":
      // Manual always specifies agentType at the API — router returns both as candidates.
      return { agentTypes: ["COMPLIANCE", "ONBOARDING"], queue: "priority" };

    case "SCHEDULED":
      return { agentTypes: ["COMPLIANCE", "ONBOARDING"], queue: "scheduled" };
  }
}

/**
 * True when the trigger is part of the pKYC-lite event taxonomy (not calendar/manual).
 */
export function isPkycEventTrigger(trigger: AgentTrigger): boolean {
  return (
    trigger === "EVENT_EXPIRY_PROXIMITY" ||
    trigger === "EVENT_RISK_TIER_CHANGE" ||
    trigger === "EVENT_PROFILE_MATERIAL_CHANGE" ||
    trigger === "EVENT_SANCTIONS_PEP"
  );
}
