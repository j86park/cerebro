import { z } from "zod";

export const COMPLIANCE_WORKING_MEMORY_SCHEMA = z.object({
  currentEscalationStage: z.number().min(0).max(5).default(0),
  lastActionType: z.string().nullable().default(null),
  lastActionDate: z.string().nullable().default(null),
  notificationCounts: z.record(z.string(), z.number()).default({}),
  isEscalated: z.boolean().default(false),
  escalatedTo: z
    .enum(["ADVISOR", "COMPLIANCE_OFFICER", "MANAGEMENT"])
    .nullable()
    .default(null),
  openIssues: z.array(z.string()).default([]),
});

export type ComplianceWorkingMemory = z.infer<
  typeof COMPLIANCE_WORKING_MEMORY_SCHEMA
>;
