import { z } from "zod";

export const ONBOARDING_WORKING_MEMORY_SCHEMA = z.object({
  currentStage: z.number().min(0).max(4).default(0),
  lastDocumentRequested: z.string().nullable().default(null),
  lastRequestDate: z.string().nullable().default(null),
  stageStartDate: z.string().nullable().default(null),
  advisorAlerted: z.boolean().default(false),
  completedStages: z.array(z.number()).default([]),
});

export type OnboardingWorkingMemory = z.infer<
  typeof ONBOARDING_WORKING_MEMORY_SCHEMA
>;
