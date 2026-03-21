# Cerebro — Implementation Gaps & Test Plan

This document lists gaps between the **current codebase**, **`docs/milestones.md`**, and **`docs/futurevault-agent-blueprint.md`**. Each gap includes what to implement and which tests should gate it.

---

## How to use this file

- Treat each section as a **backlog slice**: implement → add/run tests → check off.
- Tests are **suggested paths/names** under `tests/` unless an existing file already covers the behavior (referenced where known).

---

## 1. Database & foundation (Milestone 1)

### Gaps

| Gap | Why it matters |
|-----|----------------|
| **No committed Prisma migrations** in repo (only `schema.prisma` + `db:migrate` script) | Environments cannot reproduce the same schema without running migrate locally; CI/prod risk. |
| **`reset-demo.ts` vs milestone spec** | Milestone requires resetting **documents** and **client onboarding fields** to seed baseline, not only deleting non-seeded actions then reseed. |
| **`GET /api/vaults/[clientId]` uses `prisma` for existence check** | Rest of vault reads use `VaultService`; mixed pattern complicates “single access layer” story for API reads. |
| **Seed vs `data-schema.md` pre-populated history** | Doc mentions CLT-007 / CLT-009 history in places; verify seed matches **canonical** table in `docs/data-schema.md` for all required rows. |

### Implement

1. Run `prisma migrate dev` for current schema; **commit** `prisma/migrations/**`.
2. Extend `scripts/reset-demo.ts` to reset `Document` rows (and `Client` onboarding fields) to seeded state, then call `runSeed()` (or equivalent idempotent upserts).
3. Optional: move client-exists check into `VaultService` or a small `src/lib/db/vault-queries.ts` helper used only by routes.

### Tests

| Test | Purpose |
|------|---------|
| `tests/scripts/reset-demo.integration.test.ts` | After reset: document counts/statuses and key clients (CLT-001 … CLT-015) match expected seed snapshot; seeded `AgentAction` rows with `outcome === "SEEDED_HISTORY"` preserved. |
| `tests/db/migrations.smoke.test.ts` (optional) | CI runs `prisma migrate deploy` against ephemeral DB and asserts `prisma.$queryRaw` or model count sanity (or document manual gate in CI). |
| Existing: `tests/scripts/seed.idempotency.test.ts` | Keep green; extend assertions if reset/seed contract changes. |

---

## 2. Infrastructure — scheduler & completion events (Milestone 2)

### Gaps

| Gap | Why it matters |
|-----|----------------|
| **No `src/lib/queue/scheduler.ts`** | Blueprint/milestones: **scheduled** full scans (compliance / onboarding cadence). Without enqueue of `cerebro-scheduled` jobs, behavior is manual/API-only. |
| **No `src/lib/events/emit.ts` (or equivalent)** | Architecture: emit completion after agent run for **realtime dashboard**. May be partially implicit; needs one clear module and contract. |
| **`src/app/api/triggers/route.ts`** | Not in `docs/architecture.md` route map—either **document** in architecture or **remove/merge** into `agents/trigger` + scheduler. |

### Implement

1. Add `src/lib/queue/scheduler.ts`: enqueue per-active-client jobs on a cron-compatible entry (separate **worker process** or **Next cron** + queue—pick one and document).
2. Add `src/lib/events/emit.ts` (or name aligned with Supabase): publish agent-run completion / simulation progress per `database.mdc` / `frontend.mdc` channel names.
3. Reconcile `api/triggers` with canonical API map.

### Tests

| Test | Purpose |
|------|---------|
| `tests/queue/scheduler.enqueues.test.ts` | Mock Redis/BullMQ: scheduler enqueues only to **`cerebro-scheduled`** with valid `AgentJobPayload`. |
| `tests/events/emit.contract.test.ts` | Emit function uses correct channel/table assumptions (unit test with mocked Supabase client). |
| Existing: `tests/queue/jobs.schema.test.ts`, `tests/queue/queueSeparation.test.ts` | Extend if new job types or enqueue paths added. |

---

## 3. API surface — vaults & simulation (Milestones 5 & 8)

### Gaps

| Gap | Why it matters |
|-----|----------------|
| **No dedicated `GET /api/vaults/[clientId]/documents` or `/actions`** | Milestone 5 lists them; current **aggregate** `GET /api/vaults/[clientId]` may be enough—if so, **update milestones/architecture** to avoid drift. |
| **No `GET /api/simulation/[runId]`** | Architecture lists single-run status; current **`/api/simulation/runs`** may bundle listing + creation. Add **run-by-id** if UI/clients need polling. |

### Implement

1. Either add thin routes that delegate to `VaultService` and return `{ data: ... }` shape per `frontend.mdc`, **or** update docs to codify the aggregate endpoint only.
2. Add `src/app/api/simulation/[runId]/route.ts` returning run status + metrics JSON from `SimulationOrchestrator` / Prisma.

### Tests

| Test | Purpose |
|------|---------|
| Extend `tests/api/vaults.responseShape.test.ts` | Cover new sub-routes or explicitly assert aggregate shape is the **only** supported contract. |
| `tests/api/simulation.runById.test.ts` | `200` + shape for completed/run failed/pending; `404` for unknown `runId`. |

---

## 4. Operations dashboard — rules & consistency (Milestone 5)

### Gaps

| Gap | Why it matters |
|-----|----------------|
| **Component names differ** from milestones (`VaultGrid` vs `ClientVaultGrid`, etc.) | Fine if behavior matches; otherwise rename or update milestone doc. |
| **Dashboard server component uses `prisma` directly** | Not forbidden for `src/app`, but diverges from “VaultService for vault reads” narrative; `any` in filters breaks strict TS rule. |
| **Realtime**: verify **channel names** match `.cursor/rules/frontend.mdc` / `database.mdc` (`cerebro-agent-actions`, etc.). |

### Implement

1. Remove `any` from dashboard data paths; type Prisma results or DTOs.
2. Align realtime channel strings with rules docs.
3. Optional: refactor reads to shared service functions that internally use `VaultService` per client (more calls, clearer boundaries).

### Tests

| Test | Purpose |
|------|---------|
| `tests/dashboard/complianceColors.test.tsx` (or similar) | Health colors match spec (`bg-green-500` / `yellow-500` / `red-500`) for fixture vault rows. |
| `tests/components/LiveAgentActivityFeed.test.tsx` | Caps at **50** items; prepends on new payload; cleanup on unmount (no duplicate subscriptions). |
| Milestone manual: CLT-012 upload → **⚡** event badge | Document as release checklist if not automated. |

---

## 5. Eval suite & CI gate (Milestone 6)

### Gaps

| Gap | Why it matters |
|-----|----------------|
| **No `npm run eval` (or CI job)** in `package.json` | Milestone 6 asks for local/CI gate; `src/evals/run.ts` exists but must be **one command** and fail below threshold. |
| **`process.env.GITHUB_SHA` in `src/evals/run.ts`** | `.cursor/rules/core.mdc`: only `src/lib/config.ts` reads `process.env`. Either extend `env` schema with optional `GITHUB_SHA` or document explicit exception in rules. |
| **Threshold enforcement** | Milestone lists overall ≥ **0.80** and per-scorer bars; verify `run.ts` **throws** or exits non-zero when below. |

### Implement

1. Add `"eval": "vitest run src/evals/run.ts"` (or dedicated runner) and document required env (`DRY_RUN=true`, etc.).
2. Wire optional `GITHUB_SHA` through `env` in `src/lib/config.ts`.
3. Ensure persistence to `EvalRun` and failure behavior match milestone.

### Tests

| Test | Purpose |
|------|---------|
| `tests/evals/run.threshold.test.ts` | Mock scorer outcomes so overall &lt; 0.80 → run **fails**; ≥ 0.80 → passes. |
| `tests/evals/scorers/*.test.ts` | One file per rule-based scorer (deterministic inputs → expected score/reason). |
| Existing coverage | `tests/simulation/eval.coverage.test.ts` — keep aligned with scenario count expectations. |

---

## 6. Testing dashboard (Milestone 7)

### Gaps

| Gap | Why it matters |
|-----|----------------|
| **API response shape** | `frontend.mdc` requires `{ data }` / `{ error }`; verify **all** `api/testing/*` handlers comply. |
| **Failure inspector depth** | Milestone: full trace for failures—confirm UI reads stored JSON, not mock-only. |

### Implement

1. Audit `src/app/api/testing/**/*.ts` for response envelope consistency.
2. Ensure `EvalRun` rows contain enough payload for matrix + inspector.

### Tests

| Test | Purpose |
|------|---------|
| Extend or add `tests/api/testing.routes.test.ts` | `GET /api/testing/latest`, `GET/POST /api/testing/runs`, `GET .../runs/[runId]` — status codes + `{ data }` / `{ error }`. |
| `tests/components/FailureInspector.test.tsx` | Filter + empty state + renders failure payload fields. |

---

## 7. Simulation visualization (Milestone 9) — largest UI gap

### Gaps

| Gap | Why it matters |
|-----|----------------|
| **Missing components** from milestones: `RunConfigurationPanel`, `RealtimeProgressFeed`, `OutcomeSummaryCards`, **`ABComparisonChart`**, **`TimelineChart`**, **`EscalationFunnel`**, **`RunComparisonTable`** | Blueprint Step 9 executive story (A/B ROI, funnel, timeline) is not fully surfaced. |
| Current UI: **`NewSimulationDialog`**, **`SimulationRunList`**, **`SimulationRunCard`** only | Enough to start runs/list; not enough for full demo narrative. |

### Implement

1. Add components under `src/components/simulation/` per milestone names (or rename in `milestones.md` to match existing—pick one).
2. Wire **`/simulation`** page: **A/B chart first** (per `frontend.mdc`), then timeline, funnel, summary cards, run comparison table.
3. Subscribe to simulation progress channel per rules (`cerebro-simulation-[runId]` or documented pattern).

### Tests

| Test | Purpose |
|------|---------|
| `tests/components/simulation/ABComparisonChart.test.tsx` | Renders agent vs baseline series; uses `CHART_COLORS` from `src/lib/chart-colors.ts`. |
| `tests/components/simulation/OutcomeSummaryCards.test.tsx` | Correct ratios from fixture metrics JSON. |
| `tests/components/simulation/RealtimeProgressFeed.test.tsx` | Updates from subscription callback; no setInterval polling. |
| Manual | Full run: progress visible until `SimulationRun.status === COMPLETED`. |

---

## 8. Scale, observability, runbook (Milestone 10)

### Gaps

| Gap | Why it matters |
|-----|----------------|
| **Missing `scripts/benchmark-report.ts`** | Milestone: artifact/KPI report after large run. |
| **Missing `src/lib/queue/metrics.ts`** | Queue depth, throughput, failures for ops and load triage. |
| **Missing `docs/load-testing.md`** | Runbook: how to run 10k, expected SLA, what to do on failure. |
| **Worker tuning** | Concurrency/limiter vs OpenRouter limits—needs measured defaults + docs. |

### Implement

1. Add `src/lib/queue/metrics.ts` with typed counters (or BullMQ/Redis introspection wrapper).
2. Add `scripts/benchmark-report.ts` reading last run from DB or stdout JSON → markdown/HTML summary.
3. Write `docs/load-testing.md` (commands, env, seed, teardown, success criteria).

### Tests

| Test | Purpose |
|------|---------|
| Existing: `tests/simulation/mockAgent.fidelity.test.ts` | Maintain ≥ **95%** agreement where milestone requires it; expand reference scenarios if needed. |
| Existing: `tests/simulation/load.stability.test.ts`, `worker.performance.test.ts` | Keep green; add assertions when `metrics.ts` exists (e.g. counters increment on job complete/fail). |
| `tests/queue/metrics.test.ts` | Unit test metrics aggregation logic with mocked queue events. |

---

## 9. Blueprint cross-cutting (not tied to a single milestone)

### Gaps

| Gap | Implement | Tests |
|-----|-----------|-------|
| **`docs/blueprint.md` missing**; rules reference it | Add stub pointing to `futurevault-agent-blueprint.md` or rename file and fix links. | N/A |
| **`src/lib/email/resend.ts`** not present | Centralize Resend client + dry-run behavior per `core.mdc` / tools rules; call from action tools. | `tests/lib/resend.dryRun.test.ts` — no HTTP when `DRY_RUN=true`; log/outcome still recorded if applicable. |
| **Audit log exportable** | `GET /api/vaults/.../actions/export` (CSV/JSON) or dashboard export button. | `tests/api/actions.export.test.ts` — auth (if any), shape, pagination. |
| **Public deploy story** | Vercel app + **long-running worker** for BullMQ (not serverless-only). | Smoke: health route + worker heartbeat doc in `docs/load-testing.md` or `docs/deployment.md`. |
| **Tailwind v4 + shadcn** | Largely present; verify no duplicate chart color hex outside `chart-colors.ts`. | Lint or grep test in CI: fail on `#` in `src/components` except allowed files. |

---

## 10. Suggested priority order

1. **Simulation visualization (§7)** — highest demo impact vs blueprint Step 9.  
2. **Milestone 10 observability + runbook (§8)** — unlocks confident 10k runs.  
3. **Scheduler + emit (§2)** — completes “scheduled + event” story from blueprint.  
4. **Migrations + reset-demo hardening (§1)** — production/reproducibility.  
5. **Eval CI gate + env hygiene (§5)** — regression safety.  
6. **API/doc alignment (§3, §9)** — reduces confusion for the next contributor.

---

## References

- `docs/milestones.md` — canonical milestone acceptance + test lists.  
- `docs/architecture.md` — routes, queues, VaultService, realtime.  
- `docs/futurevault-agent-blueprint.md` — product NFRs and demo definition of done.  
- `.cursor/rules/*.mdc` — non-negotiable implementation rules.
