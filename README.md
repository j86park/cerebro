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
- A [Supabase](https://supabase.com) project (free tier works) with Postgres
- An [OpenRouter](https://openrouter.ai) API key (for live agents/evals — not required for default unit CI)
- A Redis instance — [Upstash](https://upstash.com) free tier works, or run Redis locally with Docker. This repo includes **`docker-compose-redis.yml`**; you need Redis running whenever you use the app with BullMQ (queue-backed agent runs, simulation API, dashboard queue status, workers). Start it before `npm run dev` if you use local Redis:

```bash
docker compose -f docker-compose-redis.yml up -d
```

To stop it later: `docker compose -f docker-compose-redis.yml down`. Alternatively: `docker run -d -p 6379:6379 redis:alpine` (same port as `REDIS_URL=redis://localhost:6379`).

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/j86park/cerebro.git
cd cerebro
npm install
```

`npm install` runs `prisma generate` via the `postinstall` hook.

### 2. Set up environment variables

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in every variable you need for your environment. See [Environment variables](#environment-variables) below.

### 3. Set up the database

Run migrations and seed initial prompt versions (and use the full demo seed when you want sample firms/clients):

```bash
npm run db:migrate
npm run db:seed
```

Optional: load the larger demo dataset with `npm run seed` (uses `prisma/seed.ts`).

### 4. Start Redis (local development)

The Next.js server opens a Redis connection for BullMQ on startup. If nothing is listening on `REDIS_URL` (default `redis://localhost:6379`), you will see connection errors and queue-related features will not work.

```bash
docker compose -f docker-compose-redis.yml up -d
```

Use a cloud `REDIS_URL` in `.env.local` instead if you prefer not to run Docker.

### 5. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Environment variables

All env access is validated in `src/lib/config.ts`. Do not read `process.env` elsewhere.

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Postgres connection string (Supabase direct or pooler URI). |
| `REDIS_URL` | Yes | Redis URL for BullMQ (e.g. `redis://localhost:6379`). |
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
| `npm run workers` | Mutation-analysis and shadow-runner BullMQ workers (needs Redis) |
| `npm run workers:mutation` | Mutation-analysis worker only |
| `npm run workers:shadow` | Shadow-runner worker only |
| `npm run db:generate` | `prisma generate` |
| `npm run db:migrate` | `prisma migrate dev` |
| `npm run db:migrate:prod` | `prisma migrate deploy` |
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

1. **Agents** — Edit prompt templates in `src/agents/compliance/prompts.ts` and `src/agents/onboarding/prompts.ts`, then seed/version via `npm run db:seed`.
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
