# Cerebro Handover for New Assistant

## 1. What This Project Is
Cerebro is a FutureVault-oriented autonomous document-vault agent system that uses two specialized agents (Compliance and Onboarding) to monitor client document states and trigger escalating actions with full auditability; it is designed to demonstrate that a static vault can become an active operational layer with event-driven and scheduled automation for regulated advisory workflows.

## 2. What Has Been Built So Far
This section lists every tracked file currently in the repository plus local env files created during setup.

### Root
- `.env.example`: template env file with keys for DB, Redis, Supabase, OpenRouter, Resend, model tiers, `DEMO_DATE`, `DRY_RUN`, `NODE_ENV`, and webhook secret.
- `.gitignore`: ignores `node_modules`, `.next`, `dist`, `coverage`, `*.log`, `.env.local`, `.env.test`, `.env`.
- `README.md`: single-line placeholder title `# cerebro`.
- `next.config.ts`: minimal typed Next config object export.
- `package.json`: Node package manifest with scripts (`dev`, `build`, `start`, `lint`, `test`, `seed`, `reset-demo`, `bootstrap`, `db:generate`, `db:migrate`) and dependencies for Next 15 + React 18 + Prisma + Mastra + BullMQ + Supabase + Vitest.
- `package-lock.json`: npm lockfile (large) pinning dependency graph from current installs.
- `tsconfig.json`: strict TypeScript config with `moduleResolution: Bundler`, `jsx: preserve`, path alias `@/* -> src/*`, and includes for `src`, `tests`, `scripts`.
- `vitest.config.ts`: Vitest config with `@` alias resolution and node environment test execution.

### `.cursor/rules`
- `.cursor/rules/core.mdc`: global stack/rules (model usage via `getModel`, env access only in config, VaultService-only DB access in tools/agents, strict TS, dry-run constraints).
- `.cursor/rules/agents.mdc`: agent/tool/eval conventions (single Mastra instance, memory scoping, tool factory pattern, scorer thresholds).
- `.cursor/rules/database.mdc`: Prisma/VaultService/seed/queue constraints (idempotent upserts, DEMO_DATE offsets, queue separation, retry policies).
- `.cursor/rules/frontend.mdc`: route structure, thin API handlers, required dashboard panels, realtime behavior, chart standards.

### `docs`
- `docs/architecture.md`: canonical architecture and structure spec (queues, API map, VaultService scoping, worker-driven agent execution).
- `docs/data-schema.md`: canonical schema, enum set, document registry, 15-client scenarios, stage requirements, seed distributions.
- `docs/futurevault-agent-blueprint.md`: full product blueprint and 10-step build narrative.
- `docs/mastra-patterns.md`: canonical Mastra usage patterns for agent/tool/eval implementation.
- `docs/milestones.md`: sequential milestone plan with Milestone 0 (Node-only setup) and Milestones 1–10 with acceptance/test gates.

### `prisma`
- `prisma/schema.prisma`: implemented schema for `Firm`, `Advisor`, `Client`, `Document`, `AgentAction`, `SimulationRun`, `EvalRun` and enum definitions; includes indexes on `AgentAction`.
- `prisma/seed.ts`: implemented idempotent seed script using upserts for firms/advisors/clients/documents/seeded actions; uses `env.DEMO_DATE` offsets and document override map; exports `runSeed()` and supports direct execution path.

### `scripts`
- `scripts/bootstrap.ts`: creates required directories and ensures `.env.example`, `.env.local`, `.env.test` exist with default minimal content if missing.
- `scripts/reset-demo.ts`: deletes non-seeded `AgentAction` rows (`outcome !== "SEEDED_HISTORY"`) then re-runs `runSeed()`.

### `src/app`
- `src/app/layout.tsx`: minimal root layout wrapper.
- `src/app/page.tsx`: minimal home page placeholder text (`Cerebro scaffold initialized.`).

### `src/lib`
- `src/lib/config.ts`: Zod env parsing + defaults, OpenRouter provider initialization, `getModel()` tier resolver.
- `src/lib/db/client.ts`: Prisma singleton with environment-based logging.
- `src/lib/db/enums.ts`: enum constants as `as const` mirrors for app code.
- `src/lib/db/vault-service.ts`: VaultService class with constructor-level client scoping and methods (`getClientProfile`, `getDocuments`, `getActionHistory`, `logAction`, `updateDocumentStatus`, `upsertDocument`, `resetOnboarding`, `deleteRuntimeActions`); supports DB injection for tests.
- `src/lib/documents/registry.ts`: document metadata registry for core document types and compliance labels/notes/rules.
- `src/lib/documents/onboarding-stages.ts`: stage-to-required-doc mapping, stuck threshold constant, and corporate additional docs list.

### `tests`
- `tests/setup.baseline.test.ts`: confirms root directories exist.
- `tests/db/vaultService.scope.test.ts`: verifies VaultService query scoping to constructor `clientId`.
- `tests/db/vaultService.logAction.test.ts`: verifies scoped log write and rejects empty reasoning via Zod schema.

### Local files present but not tracked
- `.env.local`: `DRY_RUN=true`, `NODE_ENV=development`.
- `.env.test`: `DRY_RUN=true`, `NODE_ENV=test`.

## 3. Current State of the Database
- Prisma schema state: implemented in `prisma/schema.prisma` with all main entities and enums expected by the docs; `AgentAction` includes `@@index([clientId, performedAt])` and `@@index([agentType, actionType])`.
- Migration state: no migration files exist yet; `prisma migrate dev` has not been run in this repository session.
- Seed execution state: seed script code exists, but there is no confirmed successful seed run against a real PostgreSQL database in this session because no validated runtime DB connection was provided/executed.
- Current DB contents in reality: unknown/unverified from this session.
- State of all 15 mock clients:
  - Defined in seed code (`CLT-001` through `CLT-015`) with advisor, firm, account type, onboarding status/stage, and risk profile.
  - Document overrides partially represent the scenario matrix (e.g., expired/expiring/requested/missing cases for named clients).
  - These 15 clients are specified in code but not confirmed persisted in any live DB from this session.

## 4. Tests Passing Right Now
- `tests/setup.baseline.test.ts`
  - Purpose: checks that `src`, `prisma`, `tests`, and `scripts` directories exist.
  - Status: passing.
- `tests/db/vaultService.scope.test.ts`
  - Purpose: checks `getClientProfile`, `getDocuments`, `getActionHistory` query constraints include the constructor `clientId`.
  - Status: passing.
- `tests/db/vaultService.logAction.test.ts`
  - Purpose: checks `logAction` writes `clientId`, `reasoning`, `nextScheduledAt` and rejects empty reasoning.
  - Status: passing.

Exact latest output:
```text
> cerebro@1.0.0 lint
> tsc --noEmit

> cerebro@1.0.0 test
> vitest run

 RUN  v4.1.0 C:/Users/Joonh/cerebro_cursor/cerebro

 Test Files  3 passed (3)
      Tests  4 passed (4)
   Start at  15:38:37
   Duration  244ms (transform 113ms, setup 0ms, import 281ms, tests 14ms, environment 0ms)
```

## 5. What Is Explicitly NOT Built Yet
Milestones not started (based on implementation files currently present):
- Milestone 2 (Infrastructure): not implemented.
  - Missing concrete files like `src/lib/queue/client.ts`, `src/lib/queue/jobs.ts`, `src/lib/queue/workers.ts`, `src/lib/events/emit.ts`, route handlers under `src/app/api/agents/*` and `src/app/api/webhooks/document-upload/route.ts`.
- Milestone 3 (Agents): not implemented.
  - Missing `src/agents/mastra.ts`, compliance/onboarding `agent.ts`, `prompts.ts`, `memory-schema.ts`, `index.ts`.
- Milestone 4 (Tools): not implemented.
  - Missing all tool files in `src/tools/shared`, `src/tools/compliance`, `src/tools/onboarding`.
- Milestone 5 (Operations Dashboard): not implemented.
  - Missing `src/app/dashboard/page.tsx` and all `src/components/dashboard/*`; vault API routes not implemented.
- Milestone 6 (Testing system/evals): not implemented.
  - Missing `src/evals/*` scaffolding and scorer/scenario implementations.
- Milestone 7 (Testing dashboard): not implemented.
  - Missing `src/app/testing/page.tsx`, testing API routes, and `src/components/testing/*`.
- Milestone 8 (Simulation engine): not implemented.
  - Missing `src/simulation/engine.ts`, `generator.ts`, `mock-agent.ts`, `metrics.ts`, simulation API routes.
- Milestone 9 (Simulation visualization): not implemented.
  - Missing `src/app/simulation/page.tsx` and `src/components/simulation/*`.
- Milestone 10 (Scale/load): not implemented.
  - Missing `scripts/load-test-simulation.ts`, `scripts/benchmark-report.ts`, `src/lib/queue/metrics.ts`, `tests/simulation/mockAgent.fidelity.test.ts`, `docs/load-testing.md`.

## 6. Decisions Made During Development
- Blueprint file naming mismatch was left unresolved: architecture/rules reference `docs/blueprint.md`, but existing blueprint file is `docs/futurevault-agent-blueprint.md`.
- Setup was intentionally shifted to Node-only (no Python venv) per user direction; Milestone 0 in `docs/milestones.md` reflects this.
- Prisma was set to v5 (`prisma@5.22.0`, `@prisma/client@5.22.0`) after `PrismaClient` export/type issues with v7 in this project context.
- `src/lib/config.ts` currently includes permissive defaults for required env vars to keep local compile/test green; this is practical for bootstrap but less strict than production-focused validation expectations.
- Seed strategy uses deterministic string IDs for entities/documents/actions and upserts, rather than relying on generated CUIDs in seeded records.
- Test strategy currently relies on injected mock DB objects for VaultService unit tests; no integration DB tests are implemented yet.

## 7. Known Issues or Debt
- `docs/blueprint.md` does not exist; references point to a missing path.
- `scripts/reset-demo.ts` does not yet reset document statuses and client onboarding fields before reseed in the explicit way required by database rules; it only deletes non-seeded actions then calls `runSeed()`.
- `prisma/seed.ts` seeds advisors before firms, which is opposite the stated seed order in rules docs and may violate FK expectations in strict DB states.
- `prisma/seed.ts` does not print created-vs-existing summary metrics as required by seed rules.
- `src/lib/db/vault-service.ts` methods are not fully type-safe against Prisma model types (uses broad `unknown`/string inputs and injected `PrismaLike` abstraction for testability).
- `src/lib/db/vault-service.ts` `updateDocumentStatus` update call does not explicitly enforce `clientId` in update predicate; scoping is constructor-based but not double-enforced at query where clause.
- `.env.local` and `.env.test` are intentionally ignored and present locally, but may vary by machine.
- No migrations folder exists, no DB generation/migration run is confirmed in-session.
- React runtime is 18 while installed React type packages are v19; compile passes but this mismatch should be aligned.

## 8. Where To Start Next
- Next milestone: Milestone 2 — Infrastructure (Queues, Workers, Event System).
- First task (internal dependency order): create queue primitives first.
  1. Create `src/lib/queue/client.ts` with Redis (`REDIS_URL`, local Docker) and three queues.
  2. Create `src/lib/queue/jobs.ts` with strong TS types + Zod payload schemas.
  3. Create `src/lib/queue/workers.ts` with retry/backoff and placeholder run dispatcher.
- Then create event/webhook and manual trigger API handlers:
  - `src/app/api/webhooks/document-upload/route.ts`
  - `src/app/api/agents/trigger/route.ts`
  - `src/app/api/agents/status/route.ts`
- Add tests immediately after file creation for payload validation and queue separation.

## 9. Critical Rules To Never Break
1. Never hardcode model strings outside `src/lib/config.ts`; always use `getModel(...)`.
2. Never read `process.env` outside `src/lib/config.ts`; import validated `env` everywhere else.
3. Never import/use raw `prisma` inside `src/tools/**` or `src/agents/**`; all tool DB access must go through `VaultService`.
4. `VaultService` must always be constructed with a single `clientId`; no tool should accept `clientId` input.
5. Route handlers must never run agents directly; they only validate and enqueue jobs.
6. Maintain one Mastra instance only in `src/agents/mastra.ts`.
7. Every Mastra tool must define both `inputSchema` and `outputSchema`; do not use `z.any()`.
8. All agent runs must scope memory with `resourceId = clientId` and `threadId = clientId`.
9. Always check `env.DRY_RUN` before external effects (email/webhook); still log DB action in dry run.
10. Keep queue separation strict: live priority/scheduled jobs must never mix with simulation queue jobs.

## 10. Key File Reference Map
| Decision / Pattern | Source of Truth |
|---|---|
| Product purpose and demo narrative | `docs/futurevault-agent-blueprint.md` |
| System architecture, data flow, route map, queue model | `docs/architecture.md` |
| Prisma schema, enums, seed scenarios, onboarding stages | `docs/data-schema.md` |
| Agent/tool/eval coding patterns in Mastra | `docs/mastra-patterns.md` |
| Build sequencing and milestone gates | `docs/milestones.md` |
| Global project constraints (stack, env, TS, dry run) | `.cursor/rules/core.mdc` |
| Agent/tool/eval implementation rules | `.cursor/rules/agents.mdc` |
| Database, VaultService, seed, queue constraints | `.cursor/rules/database.mdc` |
| Frontend/API route and realtime behavior rules | `.cursor/rules/frontend.mdc` |
| Actual implemented schema | `prisma/schema.prisma` |
| Actual implemented seed/reset behavior | `prisma/seed.ts`, `scripts/reset-demo.ts` |
| Actual implemented config/model resolver | `src/lib/config.ts` |
| Actual implemented vault access layer | `src/lib/db/vault-service.ts` |
| Current test coverage and assertions | `tests/setup.baseline.test.ts`, `tests/db/vaultService.scope.test.ts`, `tests/db/vaultService.logAction.test.ts` |
