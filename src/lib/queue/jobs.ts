import { z } from "zod";

export const complianceJobSchema = z.object({
  clientId: z.string(),
  reason: z.string().optional(),
  trigger: z.enum(["SCHEDULED", "EVENT_UPLOAD", "MANUAL", "SIMULATION"]).optional(),
  documentId: z.string().optional(),
});

export type ComplianceJobPayload = z.infer<typeof complianceJobSchema>;

export const onboardingJobSchema = z.object({
  clientId: z.string(),
  documentId: z.string().optional(),
  reason: z.string().optional(),
  trigger: z.enum(["SCHEDULED", "EVENT_UPLOAD", "MANUAL", "SIMULATION"]).optional(),
});

export type OnboardingJobPayload = z.infer<typeof onboardingJobSchema>;

export const defaultJobSchema = z.object({
  clientId: z.string(),
  action: z.string(),
  metadata: z.record(z.unknown()).optional(),
});

export type DefaultJobPayload = z.infer<typeof defaultJobSchema>;
