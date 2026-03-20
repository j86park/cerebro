# Load testing & large simulation runs

This runbook supports **10k+ client** simulation smoke tests and operator expectations.

## Prerequisites

- PostgreSQL reachable via `DATABASE_URL`
- Upstash Redis for BullMQ (`UPSTASH_REDIS_URL`)
- Workers running: `npx tsx scripts/start-workers.ts` (or your process manager)
- Optional: seed baseline demo data (`npm run seed`)

## Starting a large run

1. Open **Simulation** in the app or `POST /api/simulation/runs` with JSON body, e.g.  
   `{ "clientCount": 10000, "simulatedDays": 30, "useMockAgents": true }`
2. Watch **Run history** and worker logs for batch completion.
3. After completion, generate a Markdown artifact:

```bash
npx tsx scripts/benchmark-report.ts > benchmark-latest.md
```

## Success criteria

- `SimulationRun.status` ends in `COMPLETED` (or `FAILED` with a documented reason).
- No unbounded Redis memory growth (BullMQ `removeOnComplete` / retention policies in use).
- Worker concurrency stays within OpenRouter limits when **not** using mock agents (`useMockAgents: false`).

## Teardown

- Purge failed jobs in Redis if needed (Upstash console).
- For local DB resets: `npm run reset-demo` (restores seeded documents, clients, and non-runtime actions).

## Deployment note

BullMQ workers are **long-running processes**. A Vercel serverless app alone cannot drain queues; run workers on a VM, Railway, Fly.io, or similar alongside the Next.js app. Health: `GET /api/agents/status` (queue depth) + worker logs.
