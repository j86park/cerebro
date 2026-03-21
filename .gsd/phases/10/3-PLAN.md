---
phase: 10
plan: 3
wave: 2
---

# Plan 10.3: Mock-Agent Fidelity & Final Audit

## Objective
Validate that the rule-based `mock-agent` logic accurately mimics the `complianceAgent` decisions and perform the final 10,000-client load test to conclude Phase 10.

## Context
- tests/simulation/mockAgent.fidelity.test.ts
- src/simulation/mock-agent.ts
- src/agents/compliance/agent.ts

## Tasks

<task type="auto">
  <name>Implement Fidelity Test Suite</name>
  <files>tests/simulation/mockAgent.fidelity.test.ts</files>
  <action>
    Create a fidelity test suite that:
    - Runs both the `complianceAgent` and `onboardingAgent` LLMs on the 30 ground-truth scenarios.
    - Runs the rule-based `mock-agent` logic on those same scenarios.
    - Compares their chosen actions (escalation stage, document request, onboarding stage advancement).
    - Asserts >= 95% decision agreement for both COMPLIANCE and ONBOARDING agents.
  </action>
  <verify>npx vitest tests/simulation/mockAgent.fidelity.test.ts --run</verify>
  <done>Mock-agent fidelity validated against real-agent baseline for both types.</done>
</task>

<task type="auto">
  <name>Final 10k Load Test</name>
  <files>scripts/load-test-simulation.ts</files>
  <action>
    Execute the 10,000 client load test:
    - Target: 10,000 clients, 30 simulated days.
    - Monitor worker throughput and memory usage for both COMPLIANCE and ONBOARDING agent paths.
  </action>
  <verify>Run `npm run benchmark` and check output for total execution time and success rate.</verify>
  <done>10,000 client simulation completed successfully within the 20-minute SLA.</done>
</task>

<task type="auto">
  <name>Generate Benchmark Report</name>
  <files>docs/reports/milestone-10-benchmark.md</files>
  <action>
    Create a final benchmark report documenting:
    - Total clients processed.
    - End-to-end duration.
    - Average jobs/sec.
    - Fidelity score results (Compliance vs Onboarding).
    - Infrastructure bottlenecks identified (if any).
  </action>
  <verify>Check docs/reports/ directory for the benchmark report.</verify>
  <done>Final Milestone 10 benchmark report generated and saved.</done>
</task>

## Success Criteria
- [ ] Mock-agent fidelity score >= 95% for both agent types.
- [ ] 10,000-client load test successful and documented.
- [ ] Scale infrastructure audit complete and stable.
