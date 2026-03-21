## Phase 3 Verification

### Must-Haves
- [x] Create compliance and onboarding Mastra agents with scoped memory threads — VERIFIED (evidence: `src/agents/compliance/agent.ts` and `src/agents/onboarding/agent.ts` construct agents with `Memory` instances, system prompts, and `getModel("dev")` resolution).
- [x] Agent system prompts define escalation/onboarding stages — VERIFIED (evidence: `compliance/prompts.ts` has 5-stage ladder, `onboarding/prompts.ts` has 4-stage pipeline).
- [x] Working memory schemas are Zod-defined — VERIFIED (evidence: `compliance/memory-schema.ts` and `onboarding/memory-schema.ts` export Zod schemas).
- [x] Single Mastra instance in `src/agents/mastra.ts` — VERIFIED (evidence: file exports `cerebro` with both agents registered).

### Note
- `@mastra/pg` is not yet installed. The `PostgresStore` storage configuration is commented out with a TODO. This does not block Phase 3 goals (agents + memory threads exist and compile), but will need to be set up before production deployment.

### Verdict: PASS
