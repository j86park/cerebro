# STATE.md — Project State

## Current Position
- **Phase**: 10
- **Task**: 10.1 Complete
- **Status**: Ready for 10.2

## Last Session Summary
Executed Plan 10.1: Worker Hardening & Throughput Tuning. Increased simulation worker concurrency to 20, added rate limiting, and implemented performance metrics. Verified with benchmark test (> 10 days/sec throughput).

## Next Steps
1. /execute 10.2

## What Is Built
- **Milestone 1-5**: Core Vault infrastructure, Agents, Tools, and Operations Dashboard.
- **Milestone 6-7**: Testing system, Eval runner, and Testing Dashboard.
- **Milestone 8-9**: Simulation engine, Scenarios, and Compliance Scorecard UI.

## Critical Rules
1. Never hardcode model strings outside `src/lib/config.ts`.
2. `VaultService` must always be client-scoped.
3. Maintain queue isolation between live and simulation.
