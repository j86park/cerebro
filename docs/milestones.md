# Cerebro Development Milestones

This plan is sequential and blocking. Do not start a later milestone until all acceptance criteria and test gates of the current milestone pass.

---

## Milestone 0 — Project Setup and File Structure

### SCOPE
- Initialize project scaffold for Next.js 15 + TypeScript strict mode and verify base directories from `docs/architecture.md` exist.
- Create/verify repository structure and placeholders:
  - `prisma/`
  - `src/agents/`, `src/tools/`, `src/lib/`, `src/evals/`, `src/simulation/`, `src/app/`
  - `tests/`, `scripts/`, `docs/`
- Enforce Node-only local tooling and runtime setup:
  - standardize on Node + package manager only (no Python virtual environment requirements)
  - keep project scripts in `package.json` and `scripts/*.ts`/`scripts/*.js`
  - add Node artifacts to `.gitignore` as needed (`node_modules`, logs, local env files)
- Create environment configuration templates:
  - `.env.example` with all required keys from config docs
  - `.env.local` for local runtime values (not committed)
  - `.env.test` for deterministic test/eval runs
- Install and lock baseline dependencies for app/runtime/test stack and verify package manager scripts exist (`dev`, `build`, `test`, `lint`, `seed`, `reset-demo`).

Internal dependency order:
1) directory/file scaffold  
2) Node-only tooling baseline  
3) `.env.example` + `.env.local` + `.env.test` templates  
4) dependency install and script verification.

### ACCEPTANCE CRITERIA
1. Repository contains the full architecture-aligned directory skeleton before implementation begins.
2. Project setup is strictly Node-based; no milestone task requires Python virtual environments.
3. `.env.example` contains every required environment key, and `.env.local` can be populated without code edits.
4. `.gitignore` excludes Node/local-only artifacts (`node_modules`, runtime logs, `.env.local`, `.env.test`) while preserving committed templates.
5. TypeScript strict mode is enabled in `tsconfig` before any business logic code is added.
6. Baseline scripts run without missing-dependency errors.

### TESTS TO PASS
- Manual: verify `npm install` (or chosen package manager install) completes and lockfile is generated.
- Manual: run `npm run lint` and `npm run test` baseline commands with no project-setup failures.
- Manual: run env check to confirm all required variables are present in `.env.example`.
- Minimum bar: scaffold + env setup complete and reproducible on a clean machine.
- Ideal bar: one-command bootstrap script (`scripts/bootstrap.*`) provisions folders, dependencies, and env templates.

### CHECKPOINT
A clean clone can be bootstrapped into a runnable Node-only development environment with correct folders, ignored local artifacts, and working baseline scripts.

---

## Milestone 1 — Foundation (Schema, Seed, Config, VaultService)

### SCOPE
- Create/modify `prisma/schema.prisma` to match `docs/data-schema.md` models and enums exactly (including `AgentAction` indexes and append-only behavior).
- Create `src/lib/db/enums.ts` with `as const` enum objects synchronized to Prisma enums.
- Create `src/lib/config.ts` with Zod-validated env loading, `env` export, and `getModel("dev" | "demo" | "evalJudge")`; no env access elsewhere.
- Create `src/lib/db/client.ts` Prisma singleton pattern.
- Create `src/lib/db/vault-service.ts` with strict client-scoped constructor (`new VaultService({ clientId })`) and all read/write methods required by agent/tool docs.
- Create/modify `prisma/seed.ts` to seed all firms, advisors, clients (15), documents, and pre-populated action history from `docs/data-schema.md`.
- Create/modify `scripts/reset-demo.ts` to restore seeded baseline state safely and quickly.
- Create `src/lib/documents/registry.ts` and `src/lib/documents/onboarding-stages.ts` from schema definitions.
- Add or update `package.json` scripts for Prisma migrate/seed/reset-demo workflows.

Internal dependency order:
1) `config.ts` and `db/client.ts`  
2) Prisma schema + migration  
3) enums + registry + onboarding stages  
4) `vault-service.ts`  
5) seed + reset scripts.

### ACCEPTANCE CRITERIA
1. `prisma/schema.prisma` contains all required models/enums from `docs/data-schema.md` with correct relations, defaults, and indexes.
2. `src/lib/config.ts` is the only file that reads `process.env`; all other files import `env`.
3. `VaultService` rejects empty/missing `clientId` at runtime and no method accepts `clientId` as a parameter.
4. Every `VaultService` query is scoped to `this.clientId`; no cross-client read/write path exists.
5. `vault.logAction()` enforces non-empty reasoning and writes `nextScheduledAt`.
6. `prisma/seed.ts` is idempotent (upsert-only) and includes all 15 client scenarios and required seeded action history.
7. Seed date fields are derived from `env.DEMO_DATE` offsets only (no fixed calendar dates).
8. `scripts/reset-demo.ts` restores seeded state without deleting canonical seed baseline records.

### TESTS TO PASS
- Vitest: `tests/db/vaultService.scope.test.ts` verifies all read methods return only scoped client data.
- Vitest: `tests/db/vaultService.logAction.test.ts` verifies reasoning required and `nextScheduledAt` persisted.
- Vitest: `tests/scripts/seed.idempotency.test.ts` runs seed twice and compares row counts + key scenario states.
- Manual: run migrate + seed + reset and verify CLT-003/CLT-011 action history present and correct stage progression.
- Minimum bar: all tests pass and no blocking schema drift.
- Ideal bar: seed/reset completes in under 30s local baseline.

### CHECKPOINT
Database, config, and client-scoped VaultService are live, and seeded mock data reproduces all documented scenarios.

---

## Milestone 2 — Infrastructure (Queues, Workers, Event System)

### SCOPE
- Create `src/lib/queue/client.ts` for Redis (`REDIS_URL`) + BullMQ connection and three queues (`cerebro-priority`, `cerebro-scheduled`, `cerebro-simulation`).
- Create `src/lib/queue/jobs.ts` with typed job payloads and parallel Zod schemas for enqueue validation.
- Create `src/lib/queue/workers.ts` with separate workers, concurrency/rate limits, retries, and agent-run wrapper hooks.
- Create `src/lib/events/emit.ts` (or equivalent) to publish completion events to realtime layer.
- Create route handlers:
  - `src/app/api/webhooks/document-upload/route.ts`
  - `src/app/api/agents/trigger/route.ts`
  - `src/app/api/agents/status/route.ts`
- Add webhook secret validation and 202 immediate return path for uploads.
- Add queue scheduling bootstrap file (e.g., `src/lib/queue/scheduler.ts`) for periodic scan enqueues.

Internal dependency order:
1) queue client + jobs types  
2) workers  
3) webhook and manual trigger routes  
4) scheduler.

### ACCEPTANCE CRITERIA
1. All enqueue entry points validate payload with Zod before adding jobs.
2. Upload webhook requires `x-cerebro-webhook-secret` and returns `401` on mismatch.
3. Upload webhook enqueues `EVENT_UPLOAD` jobs to priority queue and returns `202` without waiting on processing.
4. Manual trigger endpoint enqueues to priority queue with trigger `MANUAL`, returns BullMQ job ID.
5. Scheduled and simulation jobs are never placed in wrong queue.
6. Worker retry/backoff behavior matches documented policy (`attempts:3`, exponential backoff).
7. Worker error path logs audit trail entry for failed run attempts.

### TESTS TO PASS
- Vitest: `tests/queue/jobs.schema.test.ts` invalid payloads are rejected for each queue.
- Vitest: `tests/api/webhook.auth.test.ts` validates 401/202 behavior.
- Vitest: `tests/queue/queueSeparation.test.ts` enqueuing helper routes each job to correct queue.
- Manual: send mock upload event and verify priority queue is consumed before scheduled jobs.
- Minimum bar: no queue cross-contamination and webhook path reliable.
- Ideal bar: under burst test (>=100 uploads), no dropped jobs.

### CHECKPOINT
Event and scheduled triggers reliably enqueue isolated jobs and workers process them with retries and audit logging.

---

## Milestone 3 — Agents (Compliance First, Then Onboarding)

### SCOPE
- Create compliance agent files:
  - `src/agents/compliance/agent.ts`
  - `src/agents/compliance/prompts.ts`
  - `src/agents/compliance/memory-schema.ts`
  - `src/agents/compliance/index.ts`
- Create onboarding agent files:
  - `src/agents/onboarding/agent.ts`
  - `src/agents/onboarding/prompts.ts`
  - `src/agents/onboarding/memory-schema.ts`
  - `src/agents/onboarding/index.ts`
- Create single Mastra instance in `src/agents/mastra.ts`.
- Update `src/lib/queue/workers.ts` to:
  - instantiate `VaultService` per run
  - build agent-specific tool sets per run
  - call agent with `resourceId/threadId = clientId`
  - route by `agentType`.

Internal dependency order:
1) Compliance agent definitions  
2) Onboarding agent definitions  
3) Mastra root instance  
4) Worker integration.

### ACCEPTANCE CRITERIA
1. There is exactly one `new Mastra(...)` definition in `src/agents/mastra.ts`.
2. Both agents use `getModel("dev")` in development path and have configured memory.
3. Both agent prompts contain required explicit rule sets (escalation ladder / onboarding stages).
4. Worker calls `cerebro.getAgent(...)`; route handlers do not directly run agents.
5. All runs pass `resourceId` and `threadId` equal to `clientId`.
6. Compliance-first build order is complete before onboarding integration starts.

### TESTS TO PASS
- Vitest: `tests/agents/compliance.initialFlow.test.ts` confirms first calls include history then compliance observation.
- Vitest: `tests/agents/onboarding.initialFlow.test.ts` confirms first calls include history then onboarding observation.
- Vitest: `tests/agents/memoryIsolation.test.ts` proves CLT-001 run cannot read CLT-002 memory.
- Manual: trigger both agent types for known clients and inspect action logs for correct `agentType/trigger`.
- Eval threshold gate (smoke only): compliance mini-eval overall >= 0.70 before opening onboarding work.
- Minimum bar: agents execute predictably with scoped memory.
- Ideal bar: deterministic output for seeded benchmark cases.

### CHECKPOINT
Both Mastra agents run from workers with isolated per-client memory and deterministic first-step behavior.

---

## Milestone 4 — Tools (Shared, Then Compliance, Then Onboarding)

### SCOPE
- Shared tools in `src/tools/shared/`:
  - `getClientProfile.ts`
  - `getActionHistory.ts`
  - `logAction.ts`
  - `sendAdvisorAlert.ts`
  - `index.ts`
- Compliance tools in `src/tools/compliance/`:
  - `getDocumentComplianceStatus.ts`
  - `sendClientReminder.ts`
  - `escalateToComplianceOfficer.ts`
  - `escalateToManagement.ts`
  - `updateDocumentStatus.ts`
  - `index.ts`
- Onboarding tools in `src/tools/onboarding/`:
  - `getOnboardingStatus.ts`
  - `requestDocument.ts`
  - `validateDocumentReceived.ts`
  - `advanceOnboardingStage.ts`
  - `completeOnboarding.ts`
  - `alertAdvisorStuck.ts`
  - `index.ts`
- Add toolset builders (if separate):
  - `src/tools/compliance/buildComplianceTools.ts`
  - `src/tools/onboarding/buildOnboardingTools.ts`.
- Update worker run path to inject built tools per run.

Internal dependency order:
1) Shared tools  
2) Compliance tools  
3) Onboarding tools  
4) Tool builders + worker wiring.

### ACCEPTANCE CRITERIA
1. Every tool is a factory receiving `VaultService`; none import `prisma` directly.
2. Every tool defines both `inputSchema` and `outputSchema` with no `z.any()`.
3. Observation tools perform no writes and no external calls.
4. Action tools always write action log entries, including in dry run mode.
5. Escalation tools enforce prerequisites in code, not prompt-only logic.
6. Event-upload flow uses `updateDocumentStatus` first (compliance) or `validateDocumentReceived` first (onboarding) before downstream actions.
7. Duplicate action cooldowns are enforced (compliance 5 days; onboarding 3 days).

### TESTS TO PASS
- Vitest: one unit test file per tool under `tests/tools/**`.
- Critical scenario tests:
  - `compliance.escalateToManagement.prereq.test.ts`
  - `compliance.duplicateCooldown.test.ts`
  - `onboarding.advanceStage.requiresAllDocsValid.test.ts`
  - `onboarding.stuckThreshold.alert.test.ts`
- Eval threshold gates:
  - Compliance tool-integrated eval suite overall >= 0.80 and escalation scorer >= 0.85.
  - Onboarding tool-integrated eval suite overall >= 0.80 and onboarding-stage scorer >= 0.85.
- Minimum bar: no invalid stage skip, no duplicate action spam.
- Ideal bar: all tool error messages are descriptive and auditable.

### CHECKPOINT
All shared/compliance/onboarding tools execute through client-scoped VaultService with enforced prerequisites and cooldown controls.

---

## Milestone 5 — Operations Dashboard

### SCOPE
- Implement API vault routes:
  - `src/app/api/vaults/route.ts`
  - `src/app/api/vaults/[clientId]/route.ts`
  - `src/app/api/vaults/[clientId]/documents/route.ts`
  - `src/app/api/vaults/[clientId]/actions/route.ts`
  - `src/app/api/vaults/[clientId]/upload/route.ts`
- Implement dashboard page and components:
  - `src/app/dashboard/page.tsx`
  - `src/components/dashboard/FirmOverviewPanel.tsx`
  - `src/components/dashboard/ClientVaultGrid.tsx`
  - `src/components/dashboard/IndividualVaultView.tsx`
  - `src/components/dashboard/LiveAgentActivityFeed.tsx`
  - `src/components/dashboard/EscalationQueuePanel.tsx`
  - `src/components/dashboard/AgentControls.tsx`
- Add realtime client helper if missing: `src/lib/supabase/client.ts`.
- Ensure channel naming/cleanup follows frontend/database rules.

Internal dependency order:
1) API read routes  
2) dashboard server page data loading  
3) client components + realtime feed  
4) trigger controls and upload path.

### ACCEPTANCE CRITERIA
1. `/dashboard` shows all required panels and health indicators with exact color mapping.
2. Activity feed shows latest 50 actions with trigger and escalation badges.
3. Realtime subscriptions update feed and affected UI state without polling.
4. Route handlers are thin; business logic remains in services/VaultService.
5. Upload route triggers event-driven queue path and reflected action appears in feed.
6. No route returns non-standard response shape.

### TESTS TO PASS
- Vitest (API): response shape and status tests for all `/api/vaults/*` routes.
- React tests:
  - `ClientVaultGrid` renders seeded clients and status colors from API data.
  - `IndividualVaultView` renders document and action tables correctly.
  - `LiveAgentActivityFeed` prepends new realtime actions and caps at 50.
- Manual:
  - Upload document for CLT-012 and verify event-triggered action appears with ⚡.
- Minimum bar: complete read path and visible live action flow.
- Ideal bar: no UI hydration/realtime subscription leaks.

### CHECKPOINT
Operations dashboard displays real vault health and live agent actions with event-trigger responsiveness.

---

## Milestone 6 — Testing System and Eval Suite

### SCOPE
- Create eval scaffolding:
  - `src/evals/ground-truth.ts`
  - `src/evals/scenarios/compliance.eval.ts`
  - `src/evals/scenarios/onboarding.eval.ts`
  - `src/evals/scorers/escalationStage.ts`
  - `src/evals/scorers/duplicateAction.ts`
  - `src/evals/scorers/documentPriority.ts`
  - `src/evals/scorers/onboardingStage.ts`
  - `src/evals/scorers/reasoningQuality.ts`
  - `src/evals/run.ts`
- Add eval persistence path into `EvalRun` table.
- Add Vitest project config for tool, agent, and eval suites.
- Add CI gate scripts (local equivalent script in `package.json`).

Internal dependency order:
1) ground truth + scorers  
2) scenario files  
3) eval runner + persistence  
4) CI script thresholds.

### ACCEPTANCE CRITERIA
1. Ground-truth includes all 15 mock scenarios and expected outcomes.
2. Rule-based scorers do not call LLMs; reasoning scorer uses `getModel("evalJudge")`.
3. Eval runs persist summary and scorer breakdown to `EvalRun`.
4. CI gate fails when overall score < 0.80.
5. Dry-run mode is active for eval execution and no real external sends occur.

### TESTS TO PASS
- Vitest: scorer unit tests for deterministic correct/incorrect outputs.
- Vitest: `src/evals/run.ts` integration run with seeded scenarios.
- Hard thresholds:
  - Overall eval >= 0.80.
  - `escalationStageScorer` >= 0.85.
  - `duplicateActionScorer` >= 0.90.
  - `onboardingStageScorer` >= 0.85.
  - `reasoningQualityScorer` >= 0.75 minimum, >= 0.85 ideal.
- Minimum bar: threshold pass and reproducible run output.
- Ideal bar: zero catastrophic scenario failures on top 5 high-risk scenarios.

### CHECKPOINT
Automated eval and test gates quantify agent quality and block regressions before feature expansion.

---

## Milestone 7 — Testing Dashboard

### SCOPE
- Implement testing API routes:
  - `src/app/api/testing/runs/route.ts`
  - `src/app/api/testing/runs/[runId]/route.ts`
  - `src/app/api/testing/latest/route.ts`
- Implement testing UI:
  - `src/app/testing/page.tsx`
  - `src/components/testing/EvalOverview.tsx`
  - `src/components/testing/ScorerBreakdown.tsx`
  - `src/components/testing/ScenarioMatrix.tsx`
  - `src/components/testing/FailureInspector.tsx`
  - `src/components/testing/RegressionTracker.tsx`
- Add chart constants in `src/lib/chart-colors.ts` if missing and use consistently.

Internal dependency order:
1) testing APIs  
2) overview + breakdown panels  
3) failure inspector + matrix  
4) regression chart.

### ACCEPTANCE CRITERIA
1. `/testing` shows required five panels with persisted eval data.
2. Scenario matrix maps scenarios x scorers and marks failing cells clearly.
3. Failure inspector can filter failures and display full trace details from stored data.
4. Regression tracker shows at least last 30 runs when available.
5. No panel relies on hardcoded mock-only values when DB data exists.

### TESTS TO PASS
- Vitest (API): testing routes return consistent response schema and proper 404 behavior.
- React tests:
  - score bars and trend chart render correct values from fixture `EvalRun` rows.
  - failure inspector filtering returns expected subset.
- Manual: run evals twice and confirm dashboard reflects both run history and trend.
- Minimum bar: current + historical eval visibility.
- Ideal bar: one-click deep-dive for any failed scenario.

### CHECKPOINT
Testing dashboard makes eval quality, failures, and regression history visible and debuggable from UI.

---

## Milestone 8 — Simulation Engine

### SCOPE
- Create simulation core files:
  - `src/simulation/distributions.ts`
  - `src/simulation/generator.ts`
  - `src/simulation/engine.ts`
  - `src/simulation/mock-agent.ts`
  - `src/simulation/metrics.ts`
- Create simulation queue payloads and worker integration in:
  - `src/lib/queue/jobs.ts` (extend)
  - `src/lib/queue/workers.ts` (simulation worker path)
- Implement simulation API controls:
  - `src/app/api/simulation/start/route.ts`
  - `src/app/api/simulation/[runId]/route.ts`
  - `src/app/api/simulation/runs/route.ts`
- Persist run lifecycle and metrics in `SimulationRun`.

Internal dependency order:
1) distributions + generator  
2) mock-agent + metrics  
3) engine loop  
4) queue integration + APIs.

### ACCEPTANCE CRITERIA
1. Simulation accepts configurable parameters (`clientCount`, `simulatedDays`, response rates, `randomSeed`).
2. Engine handles both scheduled and event-driven transitions per tick.
3. Runs are reproducible when parameters and seed are identical.
4. Dry-run mode is enforced for all action side effects during simulation.
5. `SimulationRun` status and incremental metrics update during execution.
6. Simulation jobs remain isolated in `cerebro-simulation` queue only.

### TESTS TO PASS
- Vitest: deterministic replay test (`same seed => same metrics`).
- Vitest: distribution sanity tests (rates approximate configured bounds over large sample).
- Vitest: engine tick test validates upload event triggers immediate agent path within same tick.
- Manual: start 1000-client simulation and confirm progress updates and completion persistence.
- Minimum bar: deterministic simulation with persisted outcomes.
- Ideal bar: stable 10k mock-agent run completion without worker crashes.

### CHECKPOINT
Simulation engine runs reproducible, time-compressed population scenarios with persisted progress and outcomes.

---

## Milestone 9 — Simulation Visualization

### SCOPE
- Implement simulation UI route and components:
  - `src/app/simulation/page.tsx`
  - `src/components/simulation/RunConfigurationPanel.tsx`
  - `src/components/simulation/RealtimeProgressFeed.tsx`
  - `src/components/simulation/OutcomeSummaryCards.tsx`
  - `src/components/simulation/ABComparisonChart.tsx`
  - `src/components/simulation/TimelineChart.tsx`
  - `src/components/simulation/EscalationFunnel.tsx`
  - `src/components/simulation/RunComparisonTable.tsx`
- Extend realtime subscription utilities for simulation progress channel conventions.
- Ensure A/B chart prominence and shared chart color constants.

Internal dependency order:
1) run config + start action  
2) progress feed + summary cards  
3) A/B chart + timeline + funnel  
4) run comparison table.

### ACCEPTANCE CRITERIA
1. `/simulation` includes all required panels and renders persisted run data.
2. A/B comparison chart is first prominent visualization and uses project color standards.
3. Progress feed updates live as batches complete without polling loops.
4. Timeline and funnel charts read real run metrics and handle partial-progress states.
5. Run comparison table shows recent run set (minimum five when available).

### TESTS TO PASS
- React tests:
  - A/B chart receives and displays both baseline and agent series correctly.
  - progress feed updates when realtime payload arrives.
  - summary cards compute percentages/ratios from raw metrics correctly.
- Manual: launch a simulation and observe continuous UI updates until completion.
- Minimum bar: complete visual reporting for one run.
- Ideal bar: smooth UX under long-running updates and large result payloads.

### CHECKPOINT
Simulation dashboard delivers live progress and clear outcome visuals, with A/B impact immediately visible.

---

## Milestone 10 — Scale Infrastructure and Load Testing

### SCOPE
- Harden worker/runtime scalability:
  - tune `src/lib/queue/workers.ts` concurrency and limiter strategy.
  - add simulation batching/orchestration controls in `src/simulation/engine.ts`.
- Add dedicated benchmark scripts:
  - `scripts/load-test-simulation.ts`
  - `scripts/benchmark-report.ts`
- Add infrastructure observability output:
  - `src/lib/queue/metrics.ts` (queue depth, throughput, failures).
- Add mock-agent fidelity validation suite:
  - `tests/simulation/mockAgent.fidelity.test.ts`.
- Add runbook doc:
  - `docs/load-testing.md`.

Internal dependency order:
1) workload orchestration hardening  
2) benchmark scripts + metrics collection  
3) mock-agent fidelity validation  
4) operational runbook.

### ACCEPTANCE CRITERIA
1. 10,000-client simulation path executes with queue isolation preserved and no live queue starvation.
2. Load run captures throughput, failure rate, retry count, and end-to-end duration.
3. Mock-agent behavior matches real-agent baseline on validation set at >=95%.
4. Reproducible benchmark run can be repeated from saved seed + parameter set.
5. Post-run artifact/report is generated and includes gating KPIs.

### TESTS TO PASS
- Automated benchmark gate:
  - 10,000 clients, 90 simulated days, fixed seed.
  - completion within team-agreed SLA (set initially 20 min max; tighten with profiling).
  - failure rate <1% jobs after retries.
- Vitest:
  - `mockAgent.fidelity.test.ts` >=95% decision agreement on reference scenarios.
  - queue metrics test verifies counters and error classifications.
- Manual:
  - repeat full benchmark with same seed and compare KPI deltas within tolerance.
- Minimum bar: repeatable successful large-scale run with stable output.
- Ideal bar: repeatable run plus actionable performance profile and bottleneck map.

### CHECKPOINT
Cerebro can execute and measure enterprise-scale simulations reproducibly with validated mock fidelity and documented operational limits.

---

## Global Progress Rules (Applies to All Milestones)

- Do not bypass milestone order; each stage depends on previous data contracts and runtime guarantees.
- Treat acceptance criteria as strict gates; failures block downstream work.
- Minimum passing bar unlocks next milestone; ideal bar defines hardening target before demo freeze.
- If a milestone is partially complete, document blockers explicitly and re-run only failed gates.
- Keep docs synchronized: if implementation changes schema/architecture/patterns, update `docs/data-schema.md`, `docs/architecture.md`, and `docs/mastra-patterns.md` in the same PR.
