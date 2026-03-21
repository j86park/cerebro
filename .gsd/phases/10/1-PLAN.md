---
phase: 10
plan: 1
wave: 1
---

# Plan 10.1: Worker Hardening & Throughput Tuning

## Objective
Optimize the worker infrastructure to handle high-volume simulation batches without live queue starvation and implement throughput metrics for observability.

## Context
- .gsd/SPEC.md
- src/lib/queue/workers.ts
- src/lib/queue/client.ts

## Tasks

<task type="auto">
  <name>Tune BullMQ Concurrency & Limiters</name>
  <files>src/lib/queue/workers.ts</files>
  <action>
    Modify the Worker configuration for `cerebro-simulation`:
    - Increase concurrency to 20 (or optimal local baseline).
    - Adjust the `limiter` to 50 jobs per 1000ms to respect rate limits while maximizing throughput.
    - Ensure simulation jobs do not interfere with priority queue processing.
  </action>
  <verify>Check workers.ts for updated concurrency and limiter values.</verify>
  <done>Simulation worker concurrency increased and limiter adjusted per spec.</done>
</task>

<task type="auto">
  <name>Implement Throughput Metrics</name>
  <files>src/lib/queue/workers.ts</files>
  <action>
    Add logging or a lightweight metrics collector to the worker process:
    - Track jobs/sec for simulation runs.
    - Log memory usage at 10% progress intervals for large batches.
  </action>
  <verify>Run a small simulation and check console for throughput and memory logs.</verify>
  <done>Throughput and memory metrics are visible in worker logs.</done>
</task>

<task type="auto">
  <name>Execution Test: Worker Benchmark</name>
  <files>tests/simulation/worker.performance.test.ts</files>
  <action>
    Create a performance test that:
    - Enqueues 500 mock simulation jobs.
    - Measures completion time.
    - Asserts that average throughput is > 10 jobs/sec on local dev environment.
  </action>
  <verify>npx vitest tests/simulation/worker.performance.test.ts --run</verify>
  <done>Worker benchmark test passes with > 10 jobs/sec throughput.</done>
</task>

## Success Criteria
- [ ] Simulation worker concurrency and rate limits optimized.
- [ ] Throughput metrics implemented and verified.
- [ ] Performance benchmark test passes on local infrastructure.
