# Cerebro

Cerebro is an autonomous AI system for **FutureVault-style** client document vaults. It runs two Mastra agents—a **Compliance** agent and an **Onboarding** agent—that read vault state through tools, reason with an LLM (via OpenRouter), and log actions to an audit trail. The Next.js app provides operations dashboards, a simulation console, and a testing/eval UI for measuring agent quality against ground truth.

## What's Inside

The **Compliance** agent monitors document status, escalations, reminders, and urgency ranking. The **Onboarding** agent tracks stages, document requests/validation (persisting **VALID** on pass), progress notices, and completion. Both use **versioned prompts** in PostgreSQL, share **BullMQ** workers for scans and simulations, and persist evaluation results for regression and self-correction.

**Agent capability (on `main`):** shared observation tools (`getOpenEscalations`, `getDocumentForReview`, `getChecklistGaps`, `getDecisionHistory`, `refreshDocumentExtract`); compliance `prioritizeDocuments` and `requestMissingDocument`; onboarding stage/complete notices; email tools honor `DRY_RUN` with Resend stubs; runtime step budget via `AGENT_MAX_STEPS` (default 12).

**Flag-off scaffolds (default off — production path unchanged until enabled):** Observational Memory helpers (`AGENT_OBSERVATIONAL_MEMORY`; also fail-closed under `DRY_RUN` / `NODE_ENV=test`); sanctions/PEP adapter seam (`SANCTIONS_CHECK_PROVIDER=dry-run|alloy` — no live Alloy); SOTA watch stubs for Docling extract, durable-engine probe, hybrid cost cascade, frozen-trace / evidence seal / experiment sidecar, Agent-as-a-Judge, and MCP catalog guardrails (no live MCP server).

## Architecture Overview

The **Next.js 15** App Router serves UI and **API routes** that enqueue BullMQ jobs or call Prisma. **PostgreSQL** (typically Supabase) holds vault data, `EvalRun` rows, and `PromptVersion` records. **Mastra** agents (`src/agents/`) load instructions from the DB; tools under `src/tools/` always go through **`VaultService`** (constructed with a `clientId`). **Redis** backs BullMQ for scheduled work, simulation, and self-correcting **mutation-analysis** / **shadow-run** / **online-judge** workers. Agents are **never** run from route handlers — handlers enqueue; workers run Mastra. Models come only from **`getModel("dev" | "demo" | "evalJudge")`** in `src/lib/config.ts` (never hardcoded model strings elsewhere). Dates use **`env.DEMO_DATE`**, not `new Date()` directly.

See `docs/architecture.md` for structure and API map; `ARCHITECTURE.md` for end-to-end wiring.

## Prerequisites

Before you start, you need:

- Node.js 18+ (CI uses Node 22)
- Docker Engine/Desktop with Compose for the reproducible local PostgreSQL + Redis stack, **or** your own reachable PostgreSQL and Redis services
- An [OpenRouter](https://openrouter.ai) API key only for model-backed agents/evals; the default unit tests and mock simulation do not need one
- A [Supabase](https://supabase.com) project only for Supabase Auth/Realtime integrations; the local PostgreSQL container does not provide those services

The default local stack binds PostgreSQL to `127.0.0.1:55432` and Redis to `127.0.0.1:56380`, avoiding common native-service ports. Named Docker volumes preserve data across restarts. The older `docker-compose-redis.yml` remains available for Redis-only setups, but is not needed with the full local stack.

Start the full local stack with:

```bash
npm run infra:up
```

`npm run infra:down` stops the containers without deleting their data volumes. This is for local development only; the default database password is not suitable for a remotely exposed server.

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/j86park/cerebro.git
cd cerebro
npm install
```

`npm install` runs `prisma generate` via the `postinstall` hook.

### 2. Configure local connections

```bash
cp .env.docker.example .env.local
```

The sample points the host-run app at the Compose services and keeps outbound email in `DRY_RUN`. Add an OpenRouter key only if you intend to run model-backed agents. For Supabase or other infrastructure instead, copy `.env.example` and configure its connection URLs. Never commit `.env.local`.

### 3. Start PostgreSQL and Redis

```bash
npm run infra:up
npm run infra:status
```

If you change `CEREBRO_DB_PORT`, `CEREBRO_REDIS_PORT`, or `CEREBRO_DB_PASSWORD` for Compose, update the matching URLs in `.env.local`. Password changes do not update an already-initialized PostgreSQL volume.

### 4. Migrate and verify

Apply migrations to the configured local database, then exercise the real route → Redis queue → worker flow:

```bash
npm run db:migrate:local
npm run verify:local
```

The verification script creates disposable synthetic clients in the local database. Optional on a **fresh** database: `npm run db:seed` creates initial prompt versions, and `npm run seed` loads the larger demo dataset. Do not run the initial prompt seed on an established production database; it resets prompt pointers.

### 5. Start the dev server

In a separate terminal, start the priority, scheduled, and simulation workers:

```bash
npm run workers:core
```

Then start the app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The `/dashboard` and `/testing` pages are intentionally server-rendered at
request time because they read live PostgreSQL state. A production build does
not need a reachable database, but the configured `DATABASE_URL` must be
available when the server handles those routes.

---

## Environment variables

All env access is validated in `src/lib/config.ts`. Do not read `process.env` elsewhere.

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Postgres connection string; local Compose defaults to `127.0.0.1:55432`, or use Supabase direct/pooler. |
| `REDIS_URL` | Yes | Redis URL for BullMQ; local Compose defaults to `redis://127.0.0.1:56380`. |
| `OPENROUTER_API_KEY` | Yes* | API key for LLM calls through OpenRouter. *Not needed for default `$0` unit/fixture CI. |
| `SUPABASE_URL` | Optional | Supabase project URL; defaults exist in `src/lib/config.ts` for local-only use. |
| `SUPABASE_ANON_KEY` | Optional | Supabase anon key; defaults for dev. |
| `NEXT_PUBLIC_SUPABASE_URL` | Optional | Same URL for browser Supabase client; defaults in config. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Optional | Anon key for client helpers; defaults in config. |
| `RESEND_API_KEY` | Optional | Outbound email; required when `DRY_RUN=false` and emails send. |
| `DEMO_DATE` | Optional | ISO datetime for deterministic demos/tests; defaults to “now” in config. |
| `MODEL_DEV`, `MODEL_DEMO`, `MODEL_EVAL_JUDGE` | Optional | OpenRouter model ids; resolved only via `getModel` / `getModelId`. |
| `DRY_RUN` | Optional | `true` suppresses emails/external side effects; DB writes still occur. Default `true`. |
| `AGENT_MAX_STEPS` | Optional | Mastra generate step budget (1–32). Default `12`. |
| `DOCUMENT_EXTRACT_PROVIDER` | Optional | `heuristic` (default) \| `llm-demo` \| `textract` \| `persona` \| `docling` (stub). |
| `SANCTIONS_CHECK_PROVIDER` | Optional | `dry-run` (default) \| `alloy` (unconfigured stub). |
| `AGENT_OBSERVATIONAL_MEMORY` | Optional | OM scaffold; default `false`; still disabled under `DRY_RUN`/test. |
| `DURABLE_ENGINE_PROBE`, `HYBRID_COST_CASCADE`, `EVIDENCE_SEAL`, `AGENT_AS_JUDGE`, `MCP_INTEGRATION_SURFACE` | Optional | SOTA watch scaffolds; all default **off**. |
| `EXPERIMENT_SIDECAR` | Optional | `off` (default) \| `braintrust` \| `langsmith` — never the CI system of record. |
| `CI_LIVE_EVAL` | Optional | Opt-in live OpenRouter Vitest lane. Default `false` (`$0` unit CI). |
| `EVAL_ALLOW_FULL_IN_CI` | Optional | Allow `--suite full` under CI. Default `false`. |
| `EVAL_LIVE_ABLATION` | Optional | Opt-in live canary LOO. Default `false`. |
| `WEBHOOK_SECRET` | Optional | Validates Supabase → app webhooks for document upload. |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional | Service role for server Realtime broadcast when used. |
| `CRON_SECRET` | Optional | Protects `GET /api/cron/scheduled-scans`. |
| `GITHUB_SHA` | Optional | Stored on `EvalRun` in CI. |
| `SIM_TIME_SCALE` | Optional | Simulation time scaling; default `1`. |
| `MASTRA_PG_POOL_MAX` | Optional | Caps Mastra `@mastra/pg` pool size; default `5`. |
| `MUTATION_MAX_CONSECUTIVE_REJECTIONS` | Optional | Self-correction circuit: max gate rejections before blocking enqueue. Default `3`. |
| `MUTATION_COOLDOWN_MINUTES` | Optional | Minimum minutes between mutation-analysis jobs. Default `5`. |
| `MUTATION_CIRCUIT_PAUSE_HOURS` | Optional | Pause window after circuit trips. Default `24`. |
| `NODE_ENV` | Optional | `development` \| `production` \| `test`. |

See `.env.example` for commented templates of the cheap-eval and scaffold flags.

---

## Available scripts

| Script | What it does |
|--------|----------------|
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | ESLint (Next + TypeScript rules; see note below) |
| `npm run type-check` | `tsc --noEmit` |
| `npm run test` / `test:unit` | Vitest **unit/fixture** project (`$0` OpenRouter — default CI) |
| `npm run test:live-eval` | Opt-in live OpenRouter Vitest lane (`CI_LIVE_EVAL=1`) |
| `npm run eval` / `eval:full` | Live eval suite `--suite full` with threshold enforcement |
| `npm run eval:canary` | Live eval `--suite canary` with threshold enforcement |
| `npm run eval:smoke` | Seeded subsample; **non-final** (not a release gate) |
| `npm run eval:dev` | Canary suite **without** threshold enforcement |
| `npm run eval:ablate` | Fixture tool-mask / prompt LOO ablation (`$0` by default) |
| `npm run workers:core` | Priority, scheduled, and simulation BullMQ workers using `.env.local`; also loads the auxiliary workers |
| `npm run workers` | Mutation-analysis, shadow-runner, and online-judge workers (needs Redis) |
| `npm run infra:up` / `infra:down` | Start/stop local PostgreSQL + Redis containers; retain volumes |
| `npm run infra:status` | Show container health and bound ports |
| `npm run verify:local` | Exercise route → Redis → simulation worker against `.env.local` |
| `npm run workers:mutation` | Mutation-analysis worker only |
| `npm run workers:shadow` | Shadow-runner worker only |
| `npm run db:generate` | `prisma generate` |
| `npm run db:migrate` | `prisma migrate dev` |
| `npm run db:migrate:prod` | `prisma migrate deploy` |
| `npm run db:migrate:local` | Apply migrations using `.env.local` |
| `npm run db:seed` | Seed prompt versions (`prisma/seeds/seed-prompt-versions.ts`) |
| `npm run db:studio` | Prisma Studio |
| `npm run db:reset` | `prisma migrate reset` |
| `npm run setup` | `npm install` + generate + migrate + `db:seed` |
| `npm run seed` | Full demo seed (`prisma/seed.ts`) |
| `npm run seed:prompts` | Same as `db:seed` (alias) |

**Lint:** The repo enables `next/typescript` ESLint rules. Some files still use `any`; those are reported as **warnings** until refactors land. `npm run lint` exits successfully when there are no errors.

---

## Testing and evals

### Cheap-eval CI (default PR gate)

GitHub Actions (`.github/workflows/ci-unit.yml`) runs **`npm run test:unit`** only: trajectory / frozen-trace fixtures and unit tests with `CI_LIVE_EVAL=false` and a dummy OpenRouter key. This lane is designed for **`$0` OpenRouter spend**.

### Live eval suite modes

`src/evals/suite-modes.ts` selects which clients run:

| Mode | CLI | Notes |
|------|-----|--------|
| `canary` | `npm run eval:canary` / `eval:dev` | Stratified canary partition; PR / mutation ship path |
| `full` | `npm run eval` / `eval:full` | Entire ground-truth corpus; nightly / explicit release |
| `smoke` | `npm run eval:smoke` | Seeded subsample; always **non-final** |
| `clientIds` | CLI flags | Explicit allowlist for debugging |

Under CI, `--suite full` is refused unless `EVAL_ALLOW_FULL_IN_CI=true`. AUT / agents use `getModel("dev")`; soft judges use `getModel("evalJudge")` only.

Results appear on the Testing dashboard at `/testing`.

To add a scenario:

1. Open `src/evals/ground-truth.ts`
2. Add an entry to `GROUND_TRUTH` following the existing shape
3. Re-run `npm run eval:dev` or `npm run eval:canary`

Deeper runner/scorer detail: `docs/eval-process.md` (treat source under `src/evals/` as authoritative if they diverge).

---

## Running the workers

The self-correction pipeline uses BullMQ workers (`src/workers/mutation-analysis.worker.ts`, `src/workers/shadow-runner.worker.ts`). In development you can run both:

```bash
npm run workers
```

Workers require **Redis** (`REDIS_URL`) and a working database. If Redis is down, jobs will fail to enqueue or process—check logs and [Prerequisites](#prerequisites).

Agent runs for vaults use the BullMQ worker in `src/lib/queue/workers.ts` (priority / scheduled / simulation queues)—same `VaultService` + Mastra path as evals.

## Agent workflow remediation (September 2026)

Apply pending Prisma migrations with `npm run db:migrate:prod` before starting updated workers. Interactive simulation submissions use `POST /api/simulation/runs` (the legacy `/api/simulation/start` delegates to it); they require Redis and create clients owned by one run. A stale run cannot process another run's clients, and run-specific cleanup requires an explicit run ID. See [workflow remediation and verification](docs/agent-workflow-remediation.md) for the exact isolation, retry, HITL, and recovery behavior.

In a disposable database, run `node --import tsx scripts/verify-simulation-workflows.ts` to exercise the real route, queue, worker, scoped purge, denied-access audit, and timeout replay. For model checks, set `OPENROUTER_API_KEY` in the environment, use `DRY_RUN=true`, and run `node --import tsx scripts/verify-live-agent-workflows.ts`; monitor provider-side spending. `npm run test:unit`, `npm run type-check`, and `npm run build` are the automated gates.

Existing production prompt versions override source prompt changes. `node --import tsx scripts/stage-workflow-prompts.ts` creates staging candidates only; production promotion still requires human confirmation. Never run the initial prompt seed script against an established production database to deploy a prompt update.

---

## Project structure

```
src/
  agents/          # Mastra agent definitions; prompts loaded from DB
  app/             # Next.js App Router pages and API routes
  components/      # React UI
  evals/           # Eval runner, suite modes, fixtures, scorers
  lib/             # Config, VaultService, queues, memory/sanctions/MCP scaffolds
  tools/           # Agent tools (shared, compliance, onboarding)
  workers/         # BullMQ workers and queue payloads
  workflows/       # Meta-agent taxonomy + prompt mutation helpers
prisma/
  schema.prisma
  migrations/
  seeds/
```

---

## Forking and customising

1. **Agents** — Edit prompt templates in `src/agents/compliance/prompts.ts` and `src/agents/onboarding/prompts.ts`. Seed only a fresh database with `npm run db:seed`; for an established database, stage candidate versions with `scripts/stage-workflow-prompts.ts` and use the human-confirmed promotion workflow.
2. **Scenarios** — Edit `src/evals/ground-truth.ts` and scenario files under `src/evals/scenarios/`.
3. **Tools** — Edit `src/tools/` and keep DB access inside `VaultService`.
4. Re-run `npm run eval:canary` (or `npm run test:unit` for fixture gates) to establish a baseline.

---

## Troubleshooting

**`PrismaClient` not found after install**  
Run `npm run db:generate` (also runs on `postinstall`).

**Redis connection refused**  
Start Redis: `docker compose -f docker-compose-redis.yml up -d` (see **Quick Start → step 4** above), or `docker run -d -p 6379:6379 redis:alpine`, or set `REDIS_URL` to a cloud Redis URL.

**Eval suite fails immediately**  
Ensure `DATABASE_URL` is set and migrations have run (`npm run db:migrate`). For PR-style checks without OpenRouter spend, use `npm run test:unit`.

**Type errors after pulling**  
Run `npm install && npm run db:generate`.

**`db:seed` / `seed` scripts**  
They load `.env.local` via Node’s `--env-file`. Create `.env.local` from `.env.example` first.

For deeper system behavior, see `ARCHITECTURE.md` and `docs/architecture.md`.
