## Purpose

This document explains how Cerebro is wired end to end: how HTTP and UI interact with agents, queues, and Postgres; how evaluations run; how the self-correcting prompt pipeline works; and why a few design choices look the way they do. For file layout and API inventory, see `docs/architecture.md`.

## Data flow

A browser request hits the Next.js App Router. **Server components and route handlers** may read the database through Prisma (`src/lib/db/client.ts`) or through `VaultService` when the code path is meant to mirror agent rules. The dashboard loads clients and actions directly from Prisma on the server. Client components call **API routes** under `src/app/api/` with `fetch`: for example vault upload posts to `POST /api/vaults/[clientId]/upload`, which writes a `Document` row and enqueues **priority** BullMQ jobs so background workers can invoke the same tool stacks agents use.

Agents are **not** executed inside API handlers for long-running work. Manual triggers (`POST /api/agents/trigger`) and upload-driven jobs enqueue work to Redis-backed queues; **simulation** batches enqueue day/client slices to the simulation queue. The **BullMQ worker** in `src/lib/queue/workers.ts` runs inside a worker process (started by your process manager or `npm run workers` for the dedicated self-correction workers) and is the place where `VaultService` is constructed per `clientId` and Mastra `generate` is called with toolsets.

Configuration is centralized: **`src/lib/config.ts`** parses `process.env` once and exports `env` and `getModel()`. No other file should read raw environment variables, per project rules.

## Eval pipeline

`runAllEvals()` in `src/evals/run.ts` is the single entry point used by the CLI (`npm run eval` / `npm run eval:dev`), the Testing API (`POST /api/testing/run`), and shadow runs (with `skipPersist: true`).

The function loads **compliance** and **onboarding** scenarios from `src/evals/scenarios/`. Each scenario specifies a `clientId` that exists in seeded data, an agent type, input text, expected ground truth, and a list of **scorers** imported from `src/evals/scorers/`. Scorers are built with `createScorer` from `@mastra/core/evals` (not a separate `@mastra/evals` package).

For each scenario, the code constructs a `VaultService` for that client, builds shared + domain tool objects, and calls `agent.generate()` on the memoized Mastra agent from `src/agents/mastra.ts`. Scorers receive model output plus ground truth and return per-scorer scores. Aggregates are rolled into `overallScore` and `scorerBreakdown`. Unless `skipPersist` is set, a row is inserted into **`EvalRun`** with JSON blobs for `scenarioResults` and `scorerBreakdown`, and an optional **`GITHUB_SHA`**.

When `enforceThreshold` is true (CLI `npm run eval`), `assertEvalOverallScore()` compares `overallScore` to `EVAL_OVERALL_THRESHOLD` in `src/evals/threshold.ts` and throws if the gate fails.

After a persisted run, if any scenario has a failing scorer, the mutation circuit in `src/lib/mutation-circuit.ts` may allow enqueueing a **mutation-analysis** job on Redis. If Redis is unavailable, the eval still completes but enqueue fails and is logged.

## Self-correction pipeline

The loop connects failed evals to prompt changes and shadow validation.

An **`EvalRun`** with failures can enqueue **`mutation-analysis`** (`src/workers/mutation-analysis.worker.ts`). The worker calls `analyzeEvalRun` and `buildTaxonomy` in `src/workflows/meta-agent.workflow.ts`, which use a Mastra agent to classify failure types and propose structured taxonomy output. `mutatePrompt` creates **`PromptVersion`** candidates and a **`PromptMutationJob`** row linking back to the triggering eval.

For each candidate version, jobs are pushed to the **shadow-run** queue (`src/workers/shadow-runner.worker.ts`). Shadow runs call `runAllEvals` with **`skipPersist: true`** so eval history is not polluted, while still measuring score deltas against baselines. Results land in **`ShadowRunResult`** with deltas and a pending **gate decision**.

`evaluateGate()` in `src/workers/regression-gate.ts` waits until the expected number of shadow results exists, picks the best candidate by overall delta, and applies rules: negative **canary** delta rejects (canary clients must not regress), negative **corpus** delta rejects (broad regression), non-positive **target** delta rejects (no improvement). On promotion, the winning **`PromptVersion`** becomes `isActive` for its `agentId`, others deactivate, and `invalidateAgent` clears memoized agents so the next run loads the new prompt. **`PromptLesson`** rows can record instruction snippets from taxonomy findings when the gate passes.

**`PromptMutationCircuitState`** stores consecutive rejections and cooldown-style timestamps so runaway enqueue loops are blocked (`src/lib/mutation-circuit.ts`), matching env-driven limits `MUTATION_*`.

## Database schema in plain English

**Firm** and **Advisor** model the wealth firm and staff. **Client** is the vault subject; **Document** rows track type, category, status, and expiry. **AgentAction** is the append-only audit log of what agents did, with optional **document** linkage.

**SimulationRun** records large-scale simulation batches (day ranges, client ranges, queue batch counts, status). It is separate from eval persistence.

**EvalRun** stores one eval suite execution: overall score plus JSON for per-scenario outputs and scorer aggregates.

**PromptVersion** stores versioned system prompts per logical `agentId` (`compliance` / `onboarding`), with lineage via `parentVersionId` and a single **active** version per agent at a time.

**PromptMutationJob** tracks a self-correction attempt: which eval triggered it, taxonomy JSON, candidate version ids, expected shadow runs, and status. **ShadowRunResult** holds measured deltas and gate labels for each shadow attempt.

**PromptLesson** stores short guard-rail text derived from promoted mutations. **PromptMutationCircuitState** is a singleton row used as a circuit breaker for mutation enqueue.

Enums such as **DocumentType**, **ActionType**, and **AgentType** align Prisma, tools, and UI.

## Key design decisions

**Prompts are versioned in the database** so the meta-agent pipeline can propose candidates, shadow-test them, and promote winners without redeploying code. Fallback text still exists in `prompts.ts` for bootstrapping and seeds.

**Shadow runs use `skipPersist`** so repeated shadow evals do not flood `EvalRun` history, while still using the same scoring logic as production evals.

**Canary scenarios** (identified in `src/lib/eval-scenario-utils.ts` from ground truth) are expected to stay at full pass when comparing candidates; the regression gate rejects promotions that hurt canary deltas, reflecting a hard quality bar for business-critical paths.

**Mutations are additive in effect**: new `PromptVersion` rows and `PromptLesson` entries accumulate; promotion only flips `isActive` rather than deleting history, preserving auditability and rollback options.

## Related docs

`docs/architecture.md` expands API routes and folder structure. `docs/self-correcting-agents-plan.md` and `docs/eval-process.md` contain deeper narrative and milestone history.
