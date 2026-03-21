# Self-Correcting Agents — Implementation Plan

This document captures the **Cerebro self-correcting agent pipeline** design, **repository findings**, **decisions** (including user answers), and a **numbered implementation checklist**. Implementation should follow this order unless a dependency forces a small reorder.

---

## What the system does

After each **`runAllEvals()`** that **persists** an `EvalRun`, if **any** scenario failed (any scorer &lt; 1.0), the system:

1. Reads the `EvalRun` and classifies why the agent failed.
2. Generates **3** candidate mutations of the system prompt (**additive only** — append, never restructure).
3. Runs the full eval suite **silently** per candidate (**shadow run**, `skipPersist: true`).
4. Compares scores to the **baseline** (latest real `EvalRun`) using a **regression gate**.
5. **Promotes** the best candidate if it passes, or **rejects** and logs.
6. Writes validated failure lessons to **`PromptLesson`** for runtime injection into prompts.

---

## Definitions (use everywhere)

### Fully passing scenario

A scenario is **fully passing** when **every** scorer score for that scenario is **strictly `=== 1.0`**.

Use this in:

- Regression gate logic  
- Meta-agent instructions  
- Any dry-run / shadow summaries  

### `scenarioResults` shape (baseline vs candidate)

Keyed by **`clientId`** (e.g. `"CLT-003"`). Each entry includes `agent`, optional `output` / `error`, and `scores: { [scorerId]: { score?: number; reason?: string } }`.

### Baseline for deltas

Use the **most recent persisted** `EvalRun`:

`prisma.evalRun.findFirst({ orderBy: { runAt: "desc" } })`.

Shadow runs **must not** write `EvalRun` rows (`skipPersist: true`).

---

## Decisions (locked in)

### 1. Canary scenarios (`canary: true`)

**Chosen (implementation):** mark these three in `src/evals/ground-truth.ts` once the `canary` field exists on the scenario type:

| `clientId` | Rationale |
|------------|-----------|
| **CLT-001** | **Onboarding — cold start.** Brand-new TFSA, no documents; expected `REQUEST_DOCUMENT`, stage 1. Unambiguous “start the funnel” behavior. |
| **CLT-003** | **Compliance — severe breach.** KYC long-expired with full escalation history; expected `ESCALATE_MANAGEMENT`, stage 5, `CRITICAL`. Catches fundamental compliance ladder / priority errors. |
| **CLT-005** | **Compliance — clean vault.** Fully compliant; expected `SCAN_VAULT`, `NONE`. Guards against false positives and “inventing” work when nothing is wrong. |

Together they cover **both agents**, **three distinct poles** (onboard / crisis / stable), and **deterministic** expectations with little ambiguity compared to scenarios whose comments still debate thresholds (e.g. CLT-002, CLT-007).

### 2. Redis

**User:** local **Redis via Docker** (not Upstash in dev).

**Codebase reality:** BullMQ uses **`REDIS_URL`** from `src/lib/config.ts` (default `redis://localhost:6379`), wired in `src/lib/queue/client.ts`. `.env.example` documents Docker-local Redis.

**Operational guidance:**

- Set **`REDIS_URL`** to the Docker Redis URL (typically `redis://localhost:6379`; use `rediss://` only if your broker terminates TLS).

### 3. pgvector / embeddings

**User:** pgvector is **not** enabled on Supabase yet (would require dashboard / CLI steps).

**Plan:** **Do not** add an embedding column to `PromptLesson` in the first implementation. Retrieve lessons with **`passedGate === true`**, **`regressionCount < 3`**, **`ORDER BY createdAt DESC`**, **`LIMIT 3`**. Treat **semantic / vector** retrieval as a **follow-up** after the extension is confirmed in `schema.prisma`.

---

## Repository findings (pre-implementation audit)

| Topic | Finding |
|--------|--------|
| **Prisma / pgvector** | No `vector` extension in `schema.prisma`. |
| **Mastra** | `@mastra/core` **1.13.2**. Root export is minimal (`Mastra`, `Config`). Workflow APIs are not exposed on the main entry like a simple `Workflow` import. **Implement the meta pipeline as plain async functions** in `src/workflows/meta-agent.workflow.ts`; no workflow registration required in `src/agents/mastra.ts`. |
| **BullMQ** | Already used: `src/lib/queue/client.ts` + `src/lib/queue/workers.ts`. New queues should **reuse** the same **ioredis** `connection`. |
| **Agent usage** | Direct imports in `src/evals/run.ts`, `src/lib/simulation/orchestrator.ts`; `cerebro.getAgent(...)` in `src/lib/queue/workers.ts`; barrels and tests under `tests/agents/`, etc. Refactor must update **all** of these. |
| **`cerebro` bootstrap** | `Mastra` is constructed **synchronously** with concrete `Agent` instances. Async `get*Agent()` requires an explicit strategy (e.g. **await agents before `new Mastra`**, or **lazy `getCerebro()`**). |
| **Worker entrypoint** | `scripts/start-workers.ts` imports `src/lib/queue/workers.ts`. New mutation workers must be **registered** so a running worker process consumes the new queues. |

---

## New database models

Add to `prisma/schema.prisma` (do **not** modify `EvalRun` or `SimulationRun`):

- **`PromptVersion`** — versioned prompt text, `isActive`, lineage via `parentVersionId`.  
- **`PromptMutationJob`** — job state, `taxonomy` JSON, `triggerEvalRunId`, `consecutiveFailures`, etc.  
- **`ShadowRunResult`** — per-candidate deltas and `gateDecision`.  
- **`PromptLesson`** — lessons for injection; no embedding column in v1.

After migrate: seed initial active versions from hardcoded prompts via **`prisma/seeds/seed-prompt-versions.ts`** (run manually with **`tsx`**, consistent with the repo).

---

## New / touched files (target layout)

```
src/
  lib/
    prompt-loader.ts
    lessons-loader.ts
  workers/
    queues.ts
    mutation-analysis.worker.ts
    shadow-runner.worker.ts
    regression-gate.ts
  workflows/
    types.ts
    meta-agent.workflow.ts    # plain async pipeline (not Mastra Workflow)
prisma/
  seeds/
    seed-prompt-versions.ts
```

Also:

- `src/app/api/testing/mutations/route.ts` — `GET`, last 20 jobs + relations.  
- `src/app/testing/TestingPage.tsx` — `<MutationHistory />` below `<ScenarioMatrix />`.  
- `src/evals/run.ts` — `skipPersist`, enqueue mutation job when persisted run has failures.  
- `src/evals/scenarios/scenario-types.ts` — `canary?: boolean`.  
- `src/evals/ground-truth.ts` — `canary: true` on **CLT-001**, **CLT-003**, **CLT-005**.

---

## File-by-file behavior (summary)

### `src/lib/prompt-loader.ts`

- Load active `PromptVersion` for `agentId`; **60s** in-process cache.  
- Fallback to hardcoded prompt from existing prompts module if no row.  
- **`invalidateAgent(agentId)`:** clear cache **and** reset memoized `Agent` for that agent (avoid circular imports — registry or targeted dynamic import if needed).

### `src/lib/lessons-loader.ts`

- Query lessons: `agentId`, `passedGate === true`, `regressionCount < 3`, newest first, limit 3.  
- **`injectLessons(basePrompt, lessons)`** → append **“## Guard rails”** numbered list when non-empty.

### `src/workers/queues.ts`

- Queues: **`mutation-analysis`**, **`shadow-run`**.  
- Use **`connection`** from `@/lib/queue/client` and **`env`** from `@/lib/config`.  
- Export **`mutationAnalysisQueue`**, **`shadowRunQueue`** (and reuse **`connection`** if useful).

### `src/workflows/types.ts`

- `FailureType`, `FailureFinding`, `TaxonomyReport` as specified in the original spec.

### `src/workflows/meta-agent.workflow.ts`

Three **sequential async** steps:

1. **`analyzeEvalRun(evalRunId)`** — load target `EvalRun` + last **50** `EvalRun` rows for recurrence context.  
2. **`buildTaxonomy(evalRun, recentRuns)`** — call an existing agent (prefer the agent whose scenarios failed) with strict JSON-only instructions; parse **`TaxonomyReport`** with **Zod**.  
3. **`mutatePrompt(taxonomy)`** — load active `PromptVersion`; **3×** LLM calls to produce **append-only** full prompts; persist **3** inactive `PromptVersion` rows; create/update **`PromptMutationJob`**; return candidate ids + job id + taxonomy.

### `src/workers/mutation-analysis.worker.ts`

- Job: `{ evalRunId: string }`.  
- Run meta pipeline; enqueue **one `shadow-run` job per candidate**; advance job status toward **`shadow_running`**.

### `src/workers/shadow-runner.worker.ts`

- Concurrency **1**.  
- Job: `{ mutationJobId, candidateVersionId, agentId }`.  
- **`$transaction`**: activate candidate; **`invalidateAgent`**; **`try` / `finally`**: run `runAllEvals(3, { skipPersist: true })`, **always** restore previous active version + **`invalidateAgent`** again.  
- Baseline = latest persisted `EvalRun`; compute **target / corpus / canary / overall** deltas (rates as specified).  
- Insert **`ShadowRunResult`**; call **`evaluateGate(mutationJobId)`**.

**Canary partition:** scenarios where `GROUND_TRUTH` entry has **`canary === true`** (the three IDs above). Gate requires **canary pass rate stays 1.0** (100% fully passing) vs baseline for the promoted path — implement to match the spec’s **`canaryDelta < 0` → `rejected_canary`** rule.

### `src/workers/regression-gate.ts`

- **`evaluateGate(mutationJobId)`** must run the **final** promotion/rejection logic only when **all expected shadow results** for that job exist (e.g. **3** rows — do not decide after the first shadow run completes).  
- Pick best by **`overallDelta`**.  
- Ordered rules: `canaryDelta < 0` → `rejected_canary`; `corpusDelta < 0` → `rejected_regression`; `targetDelta <= 0` → `rejected_no_improvement`; else `promoted`.  
- On **`promoted`:** transaction activate winner, `invalidateAgent`, insert **`PromptLesson`** with **`passedGate: true`** from taxonomy findings, set job **`promoted`**, reset **`consecutiveFailures`**.  
- On reject: job **`rejected`**, increment **`consecutiveFailures`**; at **≥ 3**, log **`[Cerebro] HUMAN REVIEW REQUIRED`** + `// TODO` alerting.

### `src/evals/run.ts`

1. **`skipPersist?: boolean`** — skip `prisma.evalRun.create` when true; still return `{ overallScore, scenarioResults, scorerBreakdown, evalRunId }` (use a stable placeholder id for dry runs where needed).  
2. After **successful persist**, if **any** failure: `mutationAnalysisQueue.add("analyze", { evalRunId })` — **not** when `skipPersist` is true.

### Agents (`compliance` / `onboarding`)

- Replace top-level `const` agents with **`getComplianceAgent()` / `getOnboardingAgent()`**, memoized, **`await loadPrompt()`** (and lesson injection as designed).  
- **`invalidateAgent`** after any active-version swap.

### UI / API

- **`GET /api/testing/mutations`** — last **20** `PromptMutationJob` rows, include shadow results (e.g. `gateDecision`, `overallDelta`) and candidate version metadata.  
- **`MutationHistory`** on testing page — table + badges: promoted = green, `rejected_*` = red, pending / shadow_running = amber; use existing **`cerebro-surface`**, **`cerebro-border`** classes.

---

## Guardrails (loop / cost protection)

Implemented in **`src/lib/mutation-circuit.ts`** and env in **`src/lib/config.ts`**:

| Guard | Behavior |
|--------|----------|
| **Active pipeline** | No new `mutation-analysis` enqueue while any `PromptMutationJob` is `pending`, `analyzing`, `mutating`, `shadow_running`, or `gate_evaluating`. |
| **Cooldown** | `MUTATION_COOLDOWN_MINUTES` (default **5**) — minimum time between successful enqueues. |
| **Rejection cap** | `MUTATION_MAX_CONSECUTIVE_REJECTIONS` (default **3**) — after this many **gate rejections in a row** (across jobs), further enqueues are skipped until reset or pause expiry. |
| **Auto-pause** | When the cap is hit, if `MUTATION_CIRCUIT_PAUSE_HOURS` \> **0** (default **24**), `blockedUntil` is set; after that time, the circuit **clears** `blockedUntil` and `consecutiveRejections` so you get a clean retry. If pause hours is **0**, the block stays until you fix **`PromptMutationCircuitState`** in the DB. |
| **Promotion** | Resets `consecutiveRejections` and `blockedUntil`. |

Singleton table: **`PromptMutationCircuitState`** (`id = "singleton"`).

---

## Hard rules (do not break)

- **Never** mutate or use **`SimulationRun`** for this pipeline.  
- **Never** restructure prompts during mutation — **append only**.  
- **Always** restore the **original** active `PromptVersion` after a shadow run, including on throw (**`finally`**).  
- **Always** use **`$transaction`** when swapping **`isActive`**.  
- **Always** call **`invalidateAgent(agentId)`** immediately after an **`isActive`** swap.  
- **`PromptLesson`:** only **`passedGate: true`** when gate is **`promoted`**.  
- **Lessons read path:** only **`passedGate === true`** and **`regressionCount < 3`**.  
- **Shadow runs:** **`skipPersist: true`** — **no** real `EvalRun` rows.  
- **Config:** no new direct **`process.env`** reads outside **`src/lib/config.ts`**.  
- **Validation:** Zod for job payloads and parsed LLM JSON; **no `z.any()`** for real shapes.  
- **Models:** use **`getModel(...)`** from `@/lib/config` — no hardcoded model strings elsewhere.

---

## Implementation checklist (strict order)

1. Add **`canary?: boolean`** to `src/evals/scenarios/scenario-types.ts` and align `GROUND_TRUTH` typing if needed.  
2. Set **`canary: true`** on **CLT-001**, **CLT-003**, **CLT-005** in `src/evals/ground-truth.ts`.  
3. Add the **four** Prisma models; run **`prisma migrate dev`**.  
4. Add **`prisma/seeds/seed-prompt-versions.ts`** and run once (via **`tsx`** + `.env.local`).  
5. Implement **`src/lib/prompt-loader.ts`**.  
6. Refactor **compliance** and **onboarding** agents to async factories + memoization; fix **`mastra.ts`** bootstrap; update **all** call sites (`run.ts`, `orchestrator.ts`, `queue/workers.ts`, tests, barrels).  
7. Implement **`src/lib/lessons-loader.ts`** and wire injection in agent construction.  
8. Add **`skipPersist`** to **`runAllEvals`** in `src/evals/run.ts`; verify eval suite still passes by default.  
9. Add **`src/workers/queues.ts`** (reuse existing Redis connection).  
10. Add **`src/workflows/types.ts`** and **`src/workflows/meta-agent.workflow.ts`** (plain async).  
11. Add **`src/workers/mutation-analysis.worker.ts`**.  
12. Add **`src/workers/shadow-runner.worker.ts`**.  
13. Add **`src/workers/regression-gate.ts`** (gate only after **all** shadow results for the job).  
14. Wire **mutation enqueue** in `src/evals/run.ts` (persisted runs only, on any failure).  
15. Register new workers in the same lifecycle as **`src/lib/queue/workers.ts`** / **`scripts/start-workers.ts`**.  
16. Add **`GET /api/testing/mutations`**.  
17. Add **`MutationHistory`** to **`TestingPage.tsx`**.  
18. E2E: failing eval → **`PromptMutationJob`** → shadow completes → gate row + UI.  
19. **Follow-up (post–pgvector):** add embedding column + cosine retrieval for **`PromptLesson`**.

---

## Launch script

From repo root (loads `.env.local`):

| Command | What it does |
|--------|----------------|
| `npm run self-correcting:prep` | `prisma migrate deploy` + `npm run seed:prompts`, then prints next steps (dev + workers). |
| `npm run self-correcting:test` | Same prep + `POST /api/testing/run` (retries until Next responds — start `npm run dev` first). |

Full options: `node --env-file=.env.local --import tsx scripts/self-correcting-pipeline.ts --help`

---

## References

- Original feature spec: user-provided “Implement Cerebro Self-Correcting Agents” document (conversation).  
- Project rules: `.cursor/rules/core.mdc`, `docs/architecture.md`, `docs/blueprint.md`.  
- Eval runner: `src/evals/run.ts`.  
- Queue patterns: `src/lib/queue/client.ts`, `src/lib/queue/workers.ts`.
