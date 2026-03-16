# Cerebro ROADMAP
> **Current Phase:** Phase 2 - Infrastructure
> **Status:** ✅ Complete

## Phase 1 — Foundation (COMPLETE)
**Milestones Completed:**
- Milestone 0: Project Setup and File Structure
- Milestone 1: Foundation (Schema, Seed, Config, VaultService)

**Tests Currently Passing:**
- `tests/setup.baseline.test.ts`
- `tests/db/vaultService.scope.test.ts`
- `tests/db/vaultService.logAction.test.ts`

**What Was Built:**
- Root envs and git configs: `.env.example`, `.gitignore`, `package.json`, `tsconfig.json`, `vitest.config.ts`, `README.md`, `next.config.ts`
- Cursor rules: `.cursor/rules/core.mdc`, `agents.mdc`, `database.mdc`, `frontend.mdc`
- Docs: `docs/architecture.md`, `data-schema.md`, `futurevault-agent-blueprint.md`, `mastra-patterns.md`, `milestones.md`
- Prisma schema & seed: `prisma/schema.prisma`, `prisma/seed.ts`
- Scripts: `scripts/bootstrap.ts`, `scripts/reset-demo.ts`
- Application entry points: `src/app/layout.tsx`, `src/app/page.tsx`
- Setup config & db client: `src/lib/config.ts`, `src/lib/db/client.ts`, `src/lib/db/enums.ts`, `src/lib/db/vault-service.ts`
- Documents registry: `src/lib/documents/registry.ts`, `src/lib/documents/onboarding-stages.ts`
- Baseline tests: `tests/setup.baseline.test.ts`, `tests/db/vaultService.scope.test.ts`, `tests/db/vaultService.logAction.test.ts`

## Phase 2 — Infrastructure (CURRENT — NEXT TO BUILD)
**Scope:** Create Upstash Redis + BullMQ connection for three queues. Create strongly typed job payloads, workers with backoff policies. Implement webhook triggers and manual trigger API handlers.
**Task Sequence:**
1. Create `src/lib/queue/client.ts` with Upstash Redis connection and three queues.
2. Create `src/lib/queue/jobs.ts` with strong TS types + Zod payload schemas.
3. Create `src/lib/queue/workers.ts` with retry/backoff and placeholder run dispatcher.

## Phase 3 — Agents (PENDING)
- Goal: Create compliance and onboarding Mastra agents with scoped memory threads.

## Phase 4 — Tools (PENDING)
- Goal: Create shared, compliance, and onboarding tool factories with strict Zod validation.

## Phase 5 — Operations Dashboard (PENDING)
- Goal: Implement real-time dashboard UI, vault grid, and agent activity feed via Supabase.

## Phase 6 — Testing System and Eval Suite (COMPLETE)
- Goal: Setup `runEvals()`, ground-truth scenarios, and custom scorers (rule and LLM-based) and deploy CI gates.
**Task Sequence:**
1. Generate `src/evals/ground-truth.ts` encapsulating all 15 scenarios.
2. Build custom Mastra scorers (`escalationStage`, `duplicateAction`, `reasoningQuality`, etc).
3. Connect `complianceEvals` and `onboardingEvals` isolated suites to scenarios.
4. Build `src/evals/run.ts` integration script and persist scores to the Prisma `EvalRun` database model.

## Phase 7 — Testing Dashboard (COMPLETE)
- Goal: Build testing UI for eval results, scorer matrices, and regression tracking.
  - ✅ API routes for eval result history
  - ✅ Score trend visualization
  - ✅ Scenario result matrix (Scenarios x Scorers)
  - ✅ Failure inspector for deep-dive analysis

## Phase 8 — Simulation Engine (PENDING)
- Goal: Build time-compression engine and synthetic client generator for scale testing.

## Phase 9 — Simulation Visualization (PENDING)
- Goal: Display A/B charts, run progress, and simulation outcomes in UI.

## Phase 10 — Scale Infrastructure and Load Testing (PENDING)
- Goal: Harden workers, conduct load test (10k clients), and validate mock-agent fidelity.
