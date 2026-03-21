# Cerebro

Cerebro is an autonomous AI system for **FutureVault-style** client document vaults. It runs two Mastra agents—a **Compliance** agent and an **Onboarding** agent—that read vault state through tools, reason with an LLM (via OpenRouter), and log actions to an audit trail. The Next.js app provides operations dashboards, a simulation console, and a testing/eval UI for measuring agent quality against ground truth.

## What's Inside

The **Compliance** agent monitors document status, escalations, and reminders. The **Onboarding** agent tracks onboarding stages, document requests, and completion. Both use **versioned prompts** stored in PostgreSQL, share **BullMQ** background workers for scans and simulations, and persist evaluation results for regression and self-correction workflows.

## Architecture Overview

The **Next.js 15** App Router serves UI pages and **API routes** that enqueue BullMQ jobs or call Prisma directly. **PostgreSQL** (typically Supabase) holds vault data, `EvalRun` rows, and `PromptVersion` records. **Mastra** agents (`src/agents/`) load instructions from the DB; tools live under `src/tools/` and always go through `VaultService`. **Redis** backs BullMQ queues for scheduled work, simulation batches, and the self-correcting **mutation-analysis** and **shadow-run** workers (`src/workers/`). The **eval suite** (`src/evals/`) runs scenarios, applies `@mastra/core/evals` scorers, and writes `EvalRun` rows used by `/testing` and the meta-agent pipeline.

## Prerequisites

Before you start, you need:

- Node.js 18+
- A [Supabase](https://supabase.com) project (free tier works) with Postgres
- An [OpenRouter](https://openrouter.ai) API key
- A Redis instance — [Upstash](https://upstash.com) free tier works, or run Redis locally with Docker:

```bash
docker run -d -p 6379:6379 redis:alpine
```

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

### 4. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Postgres connection string (Supabase direct or pooler URI). |
| `REDIS_URL` | Yes | Redis URL for BullMQ (e.g. `redis://localhost:6379`). |
| `OPENROUTER_API_KEY` | Yes | API key for LLM calls through OpenRouter. |
| `SUPABASE_URL` | Optional | Supabase project URL; defaults exist in `src/lib/config.ts` for local-only use. |
| `SUPABASE_ANON_KEY` | Optional | Supabase anon key; defaults for dev. |
| `NEXT_PUBLIC_SUPABASE_URL` | Optional | Same URL for browser Supabase client; defaults in config. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Optional | Anon key for client helpers; defaults in config. |
| `RESEND_API_KEY` | Optional | Outbound email; required when `DRY_RUN=false` and emails send. |
| `DEMO_DATE` | Optional | ISO datetime for deterministic demos; defaults to “now” in config. |
| `MODEL_DEV`, `MODEL_DEMO`, `MODEL_EVAL_JUDGE` | Optional | OpenRouter model ids; defaults to Kimi K2-class models in config. |
| `DRY_RUN` | Optional | `true` suppresses emails/external side effects; DB writes still occur per project rules. Default `true`. |
| `WEBHOOK_SECRET` | Optional | Validates Supabase → app webhooks for document upload. Default dev placeholder. |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional | Service role for server Realtime broadcast when used. |
| `CRON_SECRET` | Optional | Protects `GET /api/cron/scheduled-scans`. |
| `GITHUB_SHA` | Optional | Stored on `EvalRun` in CI. |
| `SIM_TIME_SCALE` | Optional | Simulation time scaling; default `1`. |
| `MASTRA_PG_POOL_MAX` | Optional | Caps Mastra `@mastra/pg` pool size; default `5`. |
| `MUTATION_MAX_CONSECUTIVE_REJECTIONS` | Optional | Self-correction circuit: max gate rejections before blocking enqueue. Default `3`. |
| `MUTATION_COOLDOWN_MINUTES` | Optional | Minimum minutes between mutation-analysis jobs. Default `5`. |
| `MUTATION_CIRCUIT_PAUSE_HOURS` | Optional | Pause window after circuit trips. Default `24`. |
| `NODE_ENV` | Optional | `development` \| `production` \| `test`. |

---

## Available scripts

| Script | What it does |
|--------|----------------|
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | ESLint (Next + TypeScript rules; see note below) |
| `npm run type-check` | `tsc --noEmit` |
| `npm run test` | Vitest test suite |
| `npm run eval` | Eval suite with **threshold enforcement** (`--enforce-threshold`) |
| `npm run eval:dev` | Eval suite **without** threshold enforcement |
| `npm run workers` | Run mutation-analysis and shadow-runner BullMQ workers (needs Redis) |
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

## Running the eval suite

The eval suite runs compliance and onboarding scenarios, scores them with `@mastra/core/evals` scorers, and persists results to `EvalRun`.

```bash
npm run eval
```

CI-style runs use threshold enforcement (overall score must meet `EVAL_OVERALL_THRESHOLD` in `src/evals/threshold.ts`). For local iteration without throwing on score:

```bash
npm run eval:dev
```

Results appear on the Testing dashboard at `/testing`.

To add a scenario:

1. Open `src/evals/ground-truth.ts`
2. Add an entry to `GROUND_TRUTH` following the existing shape
3. Re-run `npm run eval:dev` or `npm run eval`

---

## Running the workers

The self-correction pipeline uses BullMQ workers (`src/workers/mutation-analysis.worker.ts`, `src/workers/shadow-runner.worker.ts`). In development you can run both:

```bash
npm run workers
```

Workers require **Redis** (`REDIS_URL`) and a working database. If Redis is down, jobs will fail to enqueue or process—check logs and [Prerequisites](#prerequisites).

---

## Project structure

```
src/
  agents/          # Mastra agent definitions; prompts loaded from DB
  app/             # Next.js App Router pages and API routes
  components/      # React UI
  evals/           # Eval runner, scenarios, ground truth, scorers
  lib/             # Config, Prisma, queues, prompts, mutation circuit
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
4. Re-run `npm run eval` to establish a baseline.

---

## Troubleshooting

**`PrismaClient` not found after install**  
Run `npm run db:generate` (also runs on `postinstall`).

**Redis connection refused**  
Start Redis locally (`docker run -d -p 6379:6379 redis:alpine`) or set `REDIS_URL` to a cloud Redis URL.

**Eval suite fails immediately**  
Ensure `DATABASE_URL` is set and migrations have run (`npm run db:migrate`).

**Type errors after pulling**  
Run `npm install && npm run db:generate`.

**`db:seed` / `seed` scripts**  
They load `.env.local` via Node’s `--env-file`. Create `.env.local` from `.env.example` first.

For deeper system behavior, see `ARCHITECTURE.md` and `docs/architecture.md`.
