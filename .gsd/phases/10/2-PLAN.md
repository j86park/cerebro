---
phase: 10
plan: 2
wave: 1
---

# Plan 10.2: 10k Simulation Orchestration

## Objective
Implement batch-based execution and tick orchestration to scale the simulation engine to 10,000 clients with full progress observability.

## Context
- src/simulation/engine.ts
- src/simulation/generator.ts
- scripts/load-test-simulation.ts

## Tasks

<task type="auto">
  <name>Batch Simulation Ticks</name>
  <files>src/simulation/engine.ts</files>
  <action>
    Optimize `SimulationOrchestrator` to process 10k clients:
    - Implement batching for daily ticks.
    - Ensure simulation metrics are aggregated correctly across batches.
    - Prevent memory leaks during large-scale runs.
  </action>
  <verify>Check `engine.ts` for batching logic.</verify>
  <done>Simulation engine supports batched execution of ticks.</done>
</task>

<task type="auto">
  <name>Implement Load Test Script</name>
  <files>scripts/load-test-simulation.ts</files>
  <action>
    Create a script that:
    - Parameters: clientCount (default 10,000), simulatedDays (default 30).
    - Triggers the simulation.
    - Monitors progress.
    - Logs total execution time.
  </action>
  <verify>Check scripts directory for load-test-simulation.ts.</verify>
  <done>Load test script exists and is ready for use.</done>
</task>

<task type="auto">
  <name>Execution Test: 1k Run Stability</name>
  <files>tests/simulation/load.stability.test.ts</files>
  <action>
    Create a test that:
    - Runs a 1,000 client simulation for 7 days.
    - Verifies run completion and metrics persistence.
    - Asserts no worker crashes.
  </action>
  <verify>npx vitest tests/simulation/load.stability.test.ts --run</verify>
  <done>1,000 client simulation completes successfully.</done>
</task>

## Success Criteria
- [ ] Simulation engine can process 10k clients via batching.
- [ ] Load test script is functional.
- [ ] 1k run stability test passes as a precursor to the final 10k test.
