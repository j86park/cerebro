# STATE.md — Project State

## Current Position
- **Phase**: 3
- **Task**: Planning complete
- **Status**: Ready for execution

## Last Session Summary
Phase 3 planning complete. 3 execution plans generated across 2 waves.

## Next Steps
1. `/execute 3`

## Handover Source
Full developer handover is in `docs/handover.md` — read that file for complete context before modifying any existing code.

## Current Milestone
Next milestone: **Milestone 2 — Infrastructure (Queues, Workers, Event System)**.
- First task (internal dependency order): create queue primitives first.
  1. Create `src/lib/queue/client.ts` with Upstash Redis connection and three queues.
  2. Create `src/lib/queue/jobs.ts` with strong TS types + Zod payload schemas.
  3. Create `src/lib/queue/workers.ts` with retry/backoff and placeholder run dispatcher.

## What Is Built
### Root
- `.env.example`, `.gitignore`, `README.md`, `next.config.ts`, `package.json`, `package-lock.json`, `tsconfig.json`, `vitest.config.ts`
### `.cursor/rules`
- `.cursor/rules/core.mdc`, `.cursor/rules/agents.mdc`, `.cursor/rules/database.mdc`, `.cursor/rules/frontend.mdc`
### `docs`
- `docs/architecture.md`, `docs/data-schema.md`, `docs/futurevault-agent-blueprint.md`, `docs/mastra-patterns.md`, `docs/milestones.md`
### `prisma`
- `prisma/schema.prisma`, `prisma/seed.ts`
### `scripts`
- `scripts/bootstrap.ts`, `scripts/reset-demo.ts`
### `src/app`
- `src/app/layout.tsx`, `src/app/page.tsx`
### `src/lib`
- `src/lib/config.ts`, `src/lib/db/client.ts`, `src/lib/db/enums.ts`, `src/lib/db/vault-service.ts`, `src/lib/documents/registry.ts`, `src/lib/documents/onboarding-stages.ts`
### `tests`
- `tests/setup.baseline.test.ts`, `tests/db/vaultService.scope.test.ts`, `tests/db/vaultService.logAction.test.ts`
### Local files present but not tracked
- `.env.local`, `.env.test`

## Database State
- **Schema status:** Implemented in `prisma/schema.prisma` with all main entities and enums expected by the docs; `AgentAction` includes required indexes.
- **Migration status:** No migration files exist yet; `prisma migrate dev` has not been run in this repository session.
- **Seed status:** Seed script code exists, but no confirmed successful seed run against a real PostgreSQL database in this session.
- **Mock client state:** Defined in seed code (`CLT-001` through `CLT-015`) with appropriate profiles, but not confirmed persisted in any live DB from this session.

## Tests Currently Passing
- `tests/setup.baseline.test.ts` (passing)
- `tests/db/vaultService.scope.test.ts` (passing)
- `tests/db/vaultService.logAction.test.ts` (passing)

## What Is NOT Built Yet
- **Milestone 2 (Infrastructure):** not implemented. (Missing concrete files like `queue/client.ts`, `queue/jobs.ts`, `queue/workers.ts`, `events/emit.ts`, and API handlers.)
- **Milestone 3 (Agents):** not implemented. (Missing agent definition files, mastra root config, memory schemas).
- **Milestone 4 (Tools):** not implemented. (Missing shared, compliance, and onboarding tools).
- **Milestone 5 (Operations Dashboard):** not implemented. (Missing React layout, vault API).
- **Milestone 6 (Testing system/evals):** not implemented. (Scaffold and scorers missing).
- **Milestone 7 (Testing dashboard):** not implemented.
- **Milestone 8 (Simulation engine):** not implemented.
- **Milestone 9 (Simulation visualization):** not implemented.
- **Milestone 10 (Scale/load):** not implemented.

## Known Issues
- `docs/blueprint.md` does not exist; references point to a missing path (`futurevault-agent-blueprint.md`).
- `scripts/reset-demo.ts` does not yet reset document statuses and client onboarding fields before reseed in the explicit way required by database rules.
- `prisma/seed.ts` seeds advisors before firms, which is opposite the stated seed order in rules docs and may violate FK expectations.
- `prisma/seed.ts` does not print created-vs-existing summary metrics as required by seed rules.
- `src/lib/db/vault-service.ts` methods are not fully type-safe against Prisma model types.
- `src/lib/db/vault-service.ts` `updateDocumentStatus` update call does not explicitly enforce `clientId` in update predicate.
- No migrations folder exists, no DB generation/migration run is confirmed in-session.
- React runtime is 18 while installed React type packages are v19; compile passes but this mismatch should be aligned.

## Critical Rules (Never Break)
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

## Key Doc Reference Map

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

## Session Log
### Session 1 — Cursor
- Completed Milestone 0: project scaffold, env setup, directory structure
- Completed Milestone 1: Prisma schema, seed, config, VaultService
- Handed over to Antigravity via docs/handover.md
- All tests passing at handover
