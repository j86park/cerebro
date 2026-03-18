# Cerebro ROADMAP
> **Current Phase:** Phase 10 - Scale Infrastructure and Load Testing
> **Status:** [/] In Progress

## Phase 1 — Foundation (COMPLETE)
**Milestones Completed:**
- Milestone 0: Project Setup and File Structure
- Milestone 1: Foundation (Schema, Seed, Config, VaultService)

## Phase 2 — Infrastructure (COMPLETE)
- Goal: Create Upstash Redis + BullMQ connection for three queues. Create strongly typed job payloads, workers with backoff policies. Implement webhook triggers and manual trigger API handlers.

## Phase 3 — Agents (COMPLETE)
- Goal: Create compliance and onboarding Mastra agents with scoped memory threads.

## Phase 4 — Tools (COMPLETE)
- Goal: Create shared, compliance, and onboarding tool factories with strict Zod validation.

## Phase 5 — Operations Dashboard (COMPLETE)
- Goal: Implement real-time dashboard UI, vault grid, and agent activity feed via Supabase.

## Phase 6 — Testing System and Eval Suite (COMPLETE)
- Goal: Setup `runEvals()`, ground-truth scenarios, and custom scorers (rule and LLM-based) and deploy CI gates.

## Phase 7 — Testing Dashboard (COMPLETE)
- Goal: Build testing UI for eval results, scorer matrices, and regression tracking.

## Phase 8 — Simulation Engine (COMPLETE)
- Goal: Build time-compression engine and synthetic client generator for scale testing.

## Phase 9 — Scenario Matrix & Rule Validation (COMPLETE)
- Goal: Expand ground truth scenarios and implement Compliance Scorecard UI with audit trail.

## Phase 10 — Scale Infrastructure and Load Testing (CURRENT — NEXT TO BUILD)
**Scope:** Harden workers, conduct load test (10k clients), and validate mock-agent fidelity.
**Task Sequence:**
1. Tune `src/lib/queue/workers.ts` concurrency and limiter strategy.
2. Add simulation batching controls in `src/simulation/engine.ts`.
3. Create load test script `scripts/load-test-simulation.ts`.
4. Implement mock-agent fidelity test `tests/simulation/mockAgent.fidelity.test.ts`.
