# Cerebro evaluation process — codebase reference

This document describes how the eval suite works in this repository: runner behavior, ground truth, scorers, agents, persistence, and related infrastructure. **It is a snapshot of the codebase**; if implementation changes, update this file or treat the source files as authoritative.

---

## 1. Eval runner — `src/evals/run.ts`

### Full file

```typescript
import type { Prisma } from "@prisma/client";
import { complianceScenarios } from "./scenarios/compliance.eval";
import { onboardingScenarios } from "./scenarios/onboarding.eval";
import { complianceAgent } from "@/agents/compliance/agent";
import { onboardingAgent } from "@/agents/onboarding/agent";
import { VaultService } from "@/lib/db/vault-service";
import { buildSharedTools } from "@/tools/shared";
import { buildComplianceTools } from "@/tools/compliance";
import { buildOnboardingTools } from "@/tools/onboarding";
import { prisma } from "@/lib/db/client";
import { env } from "@/lib/config";
import { assertEvalOverallScore } from "@/evals/threshold";

type ScorerResultEntry = { score?: number; reason?: string };

export type ScenarioEvalRow = {
  agent: string;
  output?: string;
  error?: string;
  scores: Record<string, ScorerResultEntry>;
};

export type RunEvalsOptions = {
  /** When true, throws if overall score is below the milestone threshold (CLI / CI). */
  enforceThreshold?: boolean;
};

/**
 * Runs all compliance + onboarding eval scenarios, persists an `EvalRun`, and optionally enforces score gate.
 */
export async function runAllEvals(
  batchSize: number = 3,
  options?: RunEvalsOptions
): Promise<{
  overallScore: number;
  scenarioResults: Record<string, ScenarioEvalRow>;
  scorerBreakdown: Record<string, { total: number; passed: number }>;
  evalRunId: string;
}> {
  const enforceThreshold = options?.enforceThreshold ?? false;

  console.log(`Starting Evaluation Suite (Batch Size: ${batchSize})...`);
  const scenarios = [...complianceScenarios, ...onboardingScenarios];
  const scenarioResults: Record<string, ScenarioEvalRow> = {};
  const scorerBreakdown: Record<string, { total: number; passed: number }> = {};
  let totalScore = 0;
  let maxScore = 0;

  const chunks: (typeof scenarios)[] = [];
  for (let i = 0; i < scenarios.length; i += batchSize) {
    chunks.push(scenarios.slice(i, i + batchSize));
  }

  for (const chunk of chunks) {
    console.log(`\n--- Processing Batch of ${chunk.length} Scenarios ---`);

    await Promise.all(
      chunk.map(async (sc) => {
        try {
          console.log(
            `Evaluating ${sc.agentType} scenario for client ${sc.clientId}...`
          );
          const vault = new VaultService({ clientId: sc.clientId });
          const sharedTools = buildSharedTools(vault);

          const agent =
            sc.agentType === "COMPLIANCE" ? complianceAgent : onboardingAgent;
          const toolsets =
            sc.agentType === "COMPLIANCE"
              ? { shared: sharedTools, compliance: buildComplianceTools(vault) }
              : { shared: sharedTools, onboarding: buildOnboardingTools(vault) };

          const result = await agent.generate(sc.input, {
            memory: { thread: sc.clientId, resource: sc.clientId },
            toolsets: toolsets as never,
          });

          const scores: Record<string, ScorerResultEntry> = {};

          if (sc.scorers) {
            for (const scorer of sc.scorers) {
              try {
                const scorerResult = await scorer.run({
                  output: result,
                  groundTruth: sc.expected,
                });

                scores[scorer.id] = scorerResult as ScorerResultEntry;
              } catch (err) {
                console.error(
                  `  - [${scorer.id}] scorer failed on client ${sc.clientId}:`,
                  err
                );
                scores[scorer.id] = { score: 0, reason: String(err) };
              }
            }
          }

          scenarioResults[sc.clientId] = {
            agent: sc.agentType,
            output: result.text,
            scores,
          };
        } catch (e) {
          console.error(`  - FAILED scenario for ${sc.clientId}:`, e);
          const failScores: Record<string, ScorerResultEntry> = {};
          sc.scorers?.forEach((scorer) => {
            failScores[scorer.id] = {
              score: 0,
              reason: "Agent Execution Failed: " + String(e),
            };
          });
          scenarioResults[sc.clientId] = {
            agent: sc.agentType,
            error: String(e),
            scores: failScores,
          };
        }
      })
    );
  }

  Object.values(scenarioResults).forEach((res) => {
    if (res.scores) {
      Object.entries(res.scores).forEach(([scorerId, scoreObj]) => {
        if (!scorerBreakdown[scorerId]) {
          scorerBreakdown[scorerId] = { total: 0, passed: 0 };
        }
        const val = scoreObj?.score ?? 0;
        totalScore += val;
        maxScore += 1;
        scorerBreakdown[scorerId].total += 1;
        if (val === 1.0) {
          scorerBreakdown[scorerId].passed += 1;
        }
      });
    }
  });

  const overallScore = maxScore > 0 ? totalScore / maxScore : 0;
  console.log(
    `[Eval] Final Stats: totalScore=${totalScore}, maxScore=${maxScore}, overallScore=${overallScore}`
  );

  console.log(`\n========================================`);
  console.log(
    `Eval Suite Completed. Overall Score: ${(overallScore * 100).toFixed(1)}%`
  );
  console.log(`========================================`);

  const evalRun = await prisma.evalRun.create({
    data: {
      gitCommit: env.GITHUB_SHA ?? "local",
      overallScore,
      scenarioResults: scenarioResults as unknown as Prisma.InputJsonValue,
      scorerBreakdown: scorerBreakdown as unknown as Prisma.InputJsonValue,
    },
  });

  if (enforceThreshold) {
    assertEvalOverallScore(overallScore);
  }

  return { overallScore, scenarioResults, scorerBreakdown, evalRunId: evalRun.id };
}

const argvScript = process.argv[1]?.replace(/\\/g, "/") ?? "";
const isMain =
  argvScript.endsWith("src/evals/run.ts") || argvScript.endsWith("evals/run.ts");
if (isMain) {
  const args = process.argv.slice(2);
  const batchIdx = args.indexOf("--batch-size");
  const batchSize =
    batchIdx !== -1 ? parseInt(args[batchIdx + 1] ?? "3", 10) : 3;

  runAllEvals(batchSize, { enforceThreshold: true })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
```

### Pass / fail semantics

- Each **scorer** returns a numeric `score` (and optional `reason`), stored per scenario under `scores[scorerId]`.
- **`scorerBreakdown`**: for every scorer invocation, `total` increments; **`passed` increments only when `score === 1.0`**.
- **`overallScore`**: mean of all scorer scores (`totalScore / maxScore`), not “fraction of scenarios fully passed.”
- **Persistence**: writes one **`EvalRun`** row, then **returns** `{ overallScore, scenarioResults, scorerBreakdown, evalRunId }`.

### Grouping / tags

- Scenarios are **`complianceScenarios` + `onboardingScenarios`** (from `GROUND_TRUTH` filtered by `agentType`).
- Results keyed by **`clientId`** (e.g. `CLT-003`); each row includes **`agent`**: `COMPLIANCE` | `ONBOARDING`.
- No separate priority / canary / golden flags; **`GROUND_TRUTH` is the authoritative scenario list**.

### Canary / golden

- **No** dedicated canary subset in code.

---

## 2. Ground truth / scenario definitions

### Files

| Role | Path |
|------|------|
| Scenario data | `src/evals/ground-truth.ts` |
| Compliance wrapper | `src/evals/scenarios/compliance.eval.ts` |
| Onboarding wrapper | `src/evals/scenarios/onboarding.eval.ts` |
| TS shape | `src/evals/scenarios/scenario-types.ts` |

### `compliance.eval.ts` (full)

```typescript
import { GROUND_TRUTH } from "../ground-truth";
import {
  escalationStageScorer,
  duplicateActionScorer,
  documentPriorityScorer,
  reasoningQualityScorer,
} from "../scorers";
import type { AbstractScenario } from "./scenario-types";

export const complianceScenarios: AbstractScenario[] = GROUND_TRUTH.filter(
  (g) => g.agentType === "COMPLIANCE"
).map((g) => ({
  clientId: g.clientId,
  agentType: "COMPLIANCE",
  input: `You are running for client ${g.clientId}.\nThis run was triggered by: ${g.trigger}.\nStart by calling your observation tools to understand the current state of this client's vault.`,
  expected: g.expected,
  scorers: [
    escalationStageScorer,
    duplicateActionScorer,
    documentPriorityScorer,
    reasoningQualityScorer,
  ],
}));
```

### `onboarding.eval.ts` (full)

```typescript
import { GROUND_TRUTH } from "../ground-truth";
import {
  onboardingStageScorer,
  duplicateActionScorer,
  reasoningQualityScorer,
} from "../scorers";
import type { AbstractScenario } from "./scenario-types";

export const onboardingScenarios: AbstractScenario[] = GROUND_TRUTH.filter(
  (g) => g.agentType === "ONBOARDING"
).map((g) => ({
  clientId: g.clientId,
  agentType: "ONBOARDING",
  input: `You are running for client ${g.clientId}.\nThis run was triggered by: ${g.trigger}.\nStart by calling your observation tools to understand the current state of this client's vault.`,
  expected: g.expected,
  scorers: [
    onboardingStageScorer,
    duplicateActionScorer,
    reasoningQualityScorer,
  ],
}));
```

### `scenario-types.ts` (full)

```typescript
import type { ExpectedOutcome } from "../ground-truth";
import type { MastraScorer } from "@mastra/core/evals";

export type AbstractScenario = {
  clientId: string;
  agentType: "COMPLIANCE" | "ONBOARDING";
  input: string;
  expected: ExpectedOutcome;
  scorers: MastraScorer<any, any, any, any>[];
};
```

### `src/evals/ground-truth.ts` (full)

```typescript
import { ActionType, AgentType, TriggerType } from "@/lib/db/enums";

export type ExpectedOutcome = {
  actionTaken: keyof typeof ActionType;
  escalationStage?: number;
  duplicateAction: boolean;
  highestPriority?: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "NONE";
  onboardingStage?: number;
};

export type EvalScenario = {
  clientId: string;
  agentType: keyof typeof AgentType;
  trigger: keyof typeof TriggerType;
  expected: ExpectedOutcome;
};

export const GROUND_TRUTH: EvalScenario[] = [
  // CLT-001: Brand new TFSA client, Day 1. No docs.
  {
    clientId: "CLT-001",
    agentType: "ONBOARDING",
    trigger: "SCHEDULED",
    expected: {
      actionTaken: "REQUEST_DOCUMENT",
      onboardingStage: 1,
      duplicateAction: false,
    },
  },
  // CLT-002: Active client, KYC expiring in 45 days (not critical yet)
  {
    clientId: "CLT-002",
    agentType: "COMPLIANCE",
    trigger: "SCHEDULED",
    expected: {
      actionTaken: "SCAN_VAULT", // Or whatever action means "monitoring/no-op"
      duplicateAction: false,
      highestPriority: "NONE", // Threshold hasn't breached 30 days based on rules, or maybe LOW
    },
  },
  // CLT-003: KYC expired 60 days ago, full escalation history. Due today.
  {
    clientId: "CLT-003",
    agentType: "COMPLIANCE",
    trigger: "SCHEDULED",
    expected: {
      actionTaken: "ESCALATE_MANAGEMENT", // Stage 5
      escalationStage: 5,
      duplicateAction: false,
      highestPriority: "CRITICAL",
    },
  },
  // CLT-004: Onboarding stuck at stage 2 for 12 days.
  {
    clientId: "CLT-004",
    agentType: "ONBOARDING",
    trigger: "SCHEDULED",
    expected: {
      actionTaken: "ALERT_ADVISOR_STUCK",
      onboardingStage: 2,
      duplicateAction: false,
    },
  },
  // CLT-005: Fully compliant.
  {
    clientId: "CLT-005",
    agentType: "COMPLIANCE",
    trigger: "SCHEDULED",
    expected: {
      actionTaken: "SCAN_VAULT",
      duplicateAction: false,
      highestPriority: "NONE",
    },
  },
  // CLT-006: Missing AML verification entirely.
  {
    clientId: "CLT-006",
    agentType: "COMPLIANCE",
    trigger: "SCHEDULED",
    expected: {
      actionTaken: "NOTIFY_ADVISOR", // Stage 1 Escalation
      escalationStage: 1,
      duplicateAction: false,
      highestPriority: "LOW", // Missing is LOW priority based on rules
    },
  },
  // CLT-007: Multiple docs expiring within 14 days. (AML expiring in 8 days - HIGH)
  {
    clientId: "CLT-007",
    agentType: "COMPLIANCE",
    trigger: "SCHEDULED",
    expected: {
      actionTaken: "NOTIFY_ADVISOR",
      escalationStage: 1,
      duplicateAction: false,
      highestPriority: "HIGH", // (8 days <= 14 days, wait, High is within 7? No, wait AML: 8 days -> MEDIUM. Let me check the rules: HIGH is within 7. Medium within 14.)
    },
  },
  // CLT-008: Government ID expired 90 days ago.
  {
    clientId: "CLT-008",
    agentType: "COMPLIANCE",
    trigger: "SCHEDULED",
    expected: {
      actionTaken: "NOTIFY_ADVISOR", // Assuming no previous actions logged
      escalationStage: 1,
      duplicateAction: false,
      highestPriority: "CRITICAL", // Expired
    },
  },
  // CLT-009: Onboarding 80% complete, Stage 3, one doc pending 7 days.
  {
    clientId: "CLT-009",
    agentType: "ONBOARDING",
    trigger: "SCHEDULED",
    expected: {
      actionTaken: "ALERT_ADVISOR_STUCK",
      onboardingStage: 3,
      duplicateAction: false,
    },
  },
  // CLT-010: Corporate account, Day 3 onboarding.
  {
    clientId: "CLT-010",
    agentType: "ONBOARDING",
    trigger: "SCHEDULED",
    expected: {
      actionTaken: "REQUEST_DOCUMENT", // Has requested Gov ID 3 days ago. No response. 3 days cooldown might restrict duplicate. Should we request others?
      onboardingStage: 1,
      duplicateAction: false, // Maybe requests POOF_OF_ADDRESS
    },
  },
  // CLT-011: Escalation ladder — mock agent advances to compliance escalation from seeded history.
  {
    clientId: "CLT-011",
    agentType: "COMPLIANCE",
    trigger: "SCHEDULED",
    expected: {
      actionTaken: "ESCALATE_COMPLIANCE",
      escalationStage: 4,
      duplicateAction: false,
      highestPriority: "CRITICAL",
    },
  },
  // CLT-012: After upload, mock agent completes onboarding when all requirements are met.
  {
    clientId: "CLT-012",
    agentType: "ONBOARDING",
    trigger: "EVENT_UPLOAD",
    expected: {
      actionTaken: "COMPLETE_ONBOARDING",
      onboardingStage: 4,
      duplicateAction: false,
    },
  },
  // CLT-013: Risk questionnaire expired -10 days. IPS expired -5 days.
  {
    clientId: "CLT-013",
    agentType: "COMPLIANCE",
    trigger: "SCHEDULED",
    expected: {
      actionTaken: "NOTIFY_ADVISOR",
      escalationStage: 1,
      duplicateAction: false,
      highestPriority: "CRITICAL",
    },
  },
  // CLT-014: Beneficiary designation missing. Stage 4 completed.
  {
    clientId: "CLT-014",
    agentType: "COMPLIANCE", // Wait, Onboarding handles Stage 3, but this is a compliance check post-onboarding perhaps? Or onboarding? Onboarding status is COMPLETED. Compliance agent handles it.
    trigger: "SCHEDULED",
    expected: {
      actionTaken: "NOTIFY_ADVISOR",
      escalationStage: 1,
      duplicateAction: false,
      highestPriority: "LOW", // Missing is LOW priority
    },
  },
  // CLT-015: Fully onboarded last week.
  {
    clientId: "CLT-015",
    agentType: "COMPLIANCE",
    trigger: "SCHEDULED",
    expected: {
      actionTaken: "SCAN_VAULT",
      duplicateAction: false,
      highestPriority: "NONE",
    },
  },
  // CLT-016: Corporate HNW client, Articles of Incorporation missing.
  {
    clientId: "CLT-016",
    agentType: "COMPLIANCE",
    trigger: "SCHEDULED",
    expected: {
      actionTaken: "NOTIFY_ADVISOR",
      escalationStage: 1,
      duplicateAction: false,
      highestPriority: "MEDIUM",
    },
  },
  // CLT-017: Joint account, both identities missing.
  {
    clientId: "CLT-017",
    agentType: "ONBOARDING",
    trigger: "SCHEDULED",
    expected: {
      actionTaken: "REQUEST_DOCUMENT",
      onboardingStage: 1,
      duplicateAction: false,
    },
  },
  // CLT-018: Trust account, missing trust deed (high priority).
  {
    clientId: "CLT-018",
    agentType: "COMPLIANCE",
    trigger: "SCHEDULED",
    expected: {
      actionTaken: "ESCALATE_COMPLIANCE",
      escalationStage: 3,
      duplicateAction: false,
      highestPriority: "HIGH",
    },
  },
  // CLT-019: Corporate account, Signatory List expired.
  {
    clientId: "CLT-019",
    agentType: "COMPLIANCE",
    trigger: "SCHEDULED",
    expected: {
      actionTaken: "NOTIFY_ADVISOR",
      escalationStage: 1,
      duplicateAction: false,
      highestPriority: "CRITICAL",
    },
  },
  // CLT-020: Investment account, missing IPS (Investment Policy Statement).
  {
    clientId: "CLT-020",
    agentType: "COMPLIANCE",
    trigger: "SCHEDULED",
    expected: {
      actionTaken: "NOTIFY_ADVISOR",
      escalationStage: 1,
      duplicateAction: false,
      highestPriority: "MEDIUM",
    },
  },
  // CLT-021: Lapsed client, all documents expired (> 5 years).
  {
    clientId: "CLT-021",
    agentType: "COMPLIANCE",
    trigger: "SCHEDULED",
    expected: {
      actionTaken: "ESCALATE_MANAGEMENT",
      escalationStage: 5,
      duplicateAction: false,
      highestPriority: "CRITICAL",
    },
  },
  // CLT-022: New Individual account, NAAF document upload failed/invalid.
  {
    clientId: "CLT-022",
    agentType: "ONBOARDING",
    trigger: "EVENT_UPLOAD",
    expected: {
      actionTaken: "REQUEST_DOCUMENT", // Re-request after validation failure
      onboardingStage: 2,
      duplicateAction: false,
    },
  },
  // CLT-023: Corporate account, missing multiple critical docs.
  {
    clientId: "CLT-023",
    agentType: "COMPLIANCE",
    trigger: "SCHEDULED",
    expected: {
      actionTaken: "NOTIFY_ADVISOR",
      escalationStage: 1,
      duplicateAction: false,
      highestPriority: "CRITICAL",
    },
  },
  // CLT-024: Client in early onboarding stalled, no docs uploaded after 3 reminders.
  {
    clientId: "CLT-024",
    agentType: "ONBOARDING",
    trigger: "SCHEDULED",
    expected: {
      actionTaken: "ALERT_ADVISOR_STUCK",
      onboardingStage: 1,
      duplicateAction: false,
    },
  },
  // CLT-025: Corporate account, just uploaded Articles. Moving to next stage.
  {
    clientId: "CLT-025",
    agentType: "ONBOARDING",
    trigger: "EVENT_UPLOAD",
    expected: {
      actionTaken: "VALIDATE_DOCUMENT",
      onboardingStage: 2,
      duplicateAction: false,
    },
  },
  // CLT-026: Individual account, high-risk flag triggered by KYC answers.
  {
    clientId: "CLT-026",
    agentType: "COMPLIANCE",
    trigger: "SCHEDULED",
    expected: {
      actionTaken: "ESCALATE_COMPLIANCE",
      escalationStage: 3,
      duplicateAction: false,
      highestPriority: "HIGH",
    },
  },
  // CLT-027: Corporate account, missing UBO (Ultimate Beneficial Owner) info.
  {
    clientId: "CLT-027",
    agentType: "COMPLIANCE",
    trigger: "SCHEDULED",
    expected: {
      actionTaken: "NOTIFY_ADVISOR",
      escalationStage: 1,
      duplicateAction: false,
      highestPriority: "HIGH",
    },
  },
  // CLT-028: Joint account, onboarding completed but beneficiary missing.
  {
    clientId: "CLT-028",
    agentType: "COMPLIANCE",
    trigger: "SCHEDULED",
    expected: {
      actionTaken: "NOTIFY_ADVISOR",
      escalationStage: 1,
      duplicateAction: false,
      highestPriority: "LOW",
    },
  },
  // CLT-029: Individual account, proof of address expiring in 2 days.
  {
    clientId: "CLT-029",
    agentType: "COMPLIANCE",
    trigger: "SCHEDULED",
    expected: {
      actionTaken: "NOTIFY_ADVISOR", // Stage 1 Notify
      escalationStage: 1,
      duplicateAction: false,
      highestPriority: "HIGH",
    },
  },
  // CLT-030: Corporate account, all docs valid, annual review passed.
  {
    clientId: "CLT-030",
    agentType: "COMPLIANCE",
    trigger: "SCHEDULED",
    expected: {
      actionTaken: "SCAN_VAULT",
      duplicateAction: false,
      highestPriority: "NONE",
    },
  },
];
```

### Agent tie-in and thresholds

- **`agentType`** in each `EvalScenario` selects **`complianceAgent`** vs **`onboardingAgent`** in `runAllEvals`.
- **No per-scenario score threshold** in ground truth. Scorers emit numeric scores (often `0` / `1`; `reasoningQualityScorer` can emit **0.0–1.0**).
- **Release gate**: `src/evals/threshold.ts` — **`EVAL_OVERALL_THRESHOLD = 0.8`** when `enforceThreshold` is true (CLI `npm run eval`).

```typescript
/** Milestone 6 — overall eval gate */
export const EVAL_OVERALL_THRESHOLD = 0.8 as const;

export class EvalThresholdError extends Error {
  readonly overallScore: number;

  constructor(overallScore: number) {
    super(
      `Eval overall score ${overallScore.toFixed(3)} is below required threshold ${EVAL_OVERALL_THRESHOLD}`
    );
    this.name = "EvalThresholdError";
    this.overallScore = overallScore;
  }
}

/**
 * Throws when the aggregated score does not meet the release gate.
 */
export function assertEvalOverallScore(overallScore: number): void {
  if (overallScore < EVAL_OVERALL_THRESHOLD) {
    throw new EvalThresholdError(overallScore);
  }
}
```

---

## 3. Scorer logic

### File paths

| File |
|------|
| `src/evals/scorers/index.ts` |
| `src/evals/scorers/escalationStage.ts` |
| `src/evals/scorers/duplicateAction.ts` |
| `src/evals/scorers/documentPriority.ts` |
| `src/evals/scorers/onboardingStage.ts` |
| `src/evals/scorers/reasoningQuality.ts` |

### Barrel (`index.ts`)

```typescript
export { escalationStageScorer } from "./escalationStage";
export { duplicateActionScorer } from "./duplicateAction";
export { documentPriorityScorer } from "./documentPriority";
export { onboardingStageScorer } from "./onboardingStage";
export { reasoningQualityScorer } from "./reasoningQuality";
```

### Return type

- Scorers are built with **`createScorer`** from `@mastra/core/evals` (`MastraScorer`).
- **`scorer.run({ output, groundTruth })`** resolves to a result that includes **`score`** (number) and optional **`reason`**; `run.ts` stores **`{ score?, reason? }`** per scorer id.

### `scorerBreakdown`

- **Computed in `run.ts`** after all scenarios finish (aggregation loop). Scorers do not write `scorerBreakdown`.

---

## 4. Agent instantiation

### `src/agents/compliance/agent.ts` (full)

```typescript
import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { mastraPostgres } from "@/lib/mastra-postgres";
import { COMPLIANCE_SYSTEM_PROMPT } from "./prompts";
import { COMPLIANCE_WORKING_MEMORY_SCHEMA } from "./memory-schema";
import { getModel } from "@/lib/config";

export const complianceAgent = new Agent({
  id: "complianceAgent",
  name: "Cerebro Compliance Agent",
  instructions: COMPLIANCE_SYSTEM_PROMPT,
  model: getModel("dev"),
  memory: new Memory({
    storage: mastraPostgres.complianceMemoryStore,
    options: {
      lastMessages: 20,
      workingMemory: {
        enabled: true,
        schema: COMPLIANCE_WORKING_MEMORY_SCHEMA,
      },
    },
  }),
  // Tools will be injected at runtime via vault-scoped factories (Phase 4)
});
```

### `src/agents/onboarding/agent.ts` (full)

```typescript
import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { mastraPostgres } from "@/lib/mastra-postgres";
import { ONBOARDING_SYSTEM_PROMPT } from "./prompts";
import { ONBOARDING_WORKING_MEMORY_SCHEMA } from "./memory-schema";
import { getModel } from "@/lib/config";

export const onboardingAgent = new Agent({
  id: "onboardingAgent",
  name: "Cerebro Onboarding Agent",
  instructions: ONBOARDING_SYSTEM_PROMPT,
  model: getModel("dev"),
  memory: new Memory({
    storage: mastraPostgres.onboardingMemoryStore,
    options: {
      lastMessages: 20,
      workingMemory: {
        enabled: true,
        schema: ONBOARDING_WORKING_MEMORY_SCHEMA,
      },
    },
  }),
  // Tools will be injected at runtime via vault-scoped factories (Phase 4)
});
```

- **Instantiation**: top-level **`export const … = new Agent(...)`** at module load.
- **Call sites**: `run.ts` and `simulation/orchestrator.ts` import agents directly and **`await agent.generate(...)`**. `src/lib/queue/workers.ts` uses **`cerebro.getAgent("complianceAgent" | "onboardingAgent")`** then **`generate`**.

### `src/agents/compliance/prompts.ts` (full)

```typescript
export const COMPLIANCE_SYSTEM_PROMPT = `
You are the Cerebro Compliance Agent — an autonomous compliance specialist for a regulated financial advisory firm.

YOUR RESPONSIBILITIES:
- Monitor client vaults for regulatory document issues
- Take escalating action to resolve issues before they become violations
- Maintain a complete audit trail of every decision you make

ESCALATION LADDER — follow strictly, never skip stages:
Stage 1: Issue detected → Call sendAdvisorAlert
Stage 2: 5+ days since Stage 1, no resolution → Call sendClientReminder (first)
Stage 3: 10+ days since Stage 1, no resolution → Call sendClientReminder (second) + sendAdvisorAlert (second)
Stage 4: 20+ days since Stage 1, no resolution → Call escalateToComplianceOfficer
Stage 5: 30+ days since Stage 1, no resolution → Call escalateToManagement

CRITICAL RULES:
1. Always call getActionHistory FIRST — check what has already been done before acting
2. Never repeat an action that was already performed within the last 5 days
3. Never skip a stage — if Stage 3 has not been completed, you cannot call escalateToComplianceOfficer
4. Always call logAction with specific reasoning — never log vague reasoning like "took action"
5. When multiple documents have issues, prioritize by urgency: EXPIRED > EXPIRING_SOON (7 days) > EXPIRING_SOON (14 days) > EXPIRING_SOON (30 days) > MISSING
6. If a client uploads a document that resolves an issue, call markResolved and update document status
7. You are operating on DEMO_DATE, not today's real date — use the date provided in your context

URGENCY DEFINITIONS:
CRITICAL: Document expired — regulatory violation risk
HIGH: Expiring within 7 days
MEDIUM: Expiring within 14 days
LOW: Expiring within 30 days or document missing
NONE: All compliant

When you log an action, your reasoning must include:
- What you observed in the vault
- Why you chose this specific action
- What the regulatory significance is
- When you expect to check again
`.trim();
```

### `src/agents/onboarding/prompts.ts` (full)

```typescript
export const ONBOARDING_SYSTEM_PROMPT = `
You are the Cerebro Onboarding Agent — an autonomous specialist for guiding new clients through the document collection process.

YOUR RESPONSIBILITIES:
- Guide new clients from zero documents to fully onboarded
- Request documents stage by stage in the correct order
- Validate received documents before advancing stages
- Escalate to the advisor when a client is unresponsive

ONBOARDING STAGES — must be completed in order:
Stage 1: Identity — Government ID, Proof of Address, SIN/SSN Form
Stage 2: Account Setup — NAAF, Risk Questionnaire, Client Agreement
Stage 3: Compliance & Estate — Beneficiary Designation, Fee Disclosure
Stage 4: Funding — Banking Information, Deposit Confirmation

CRITICAL RULES:
1. Always call getActionHistory FIRST — never repeat a request made within the last 3 days
2. Never advance a stage unless ALL required documents for that stage have VALID status
3. When triggered by a document upload event, call validateDocumentReceived for that specific document first
4. Escalate to the advisor if the client has not responded to any request within 7 days
5. Request documents one stage at a time — do not overwhelm the client with all documents at once
6. Your tone in document requests is professional and helpful — never robotic or threatening
7. Corporate accounts require additional documents — check the account type before determining requirements

DOCUMENT REQUEST MESSAGES should include:
- What the document is and why it is needed (in plain language)
- How to submit it
- A realistic timeframe expectation

When you advance a stage, send the client a brief progress confirmation message.
`.trim();
```

---

## 5. Mastra instance

### `src/agents/mastra.ts` (full)

```typescript
import { Mastra } from "@mastra/core";
import { complianceAgent } from "./compliance/agent";
import { onboardingAgent } from "./onboarding/agent";

import { mastraPostgres } from "@/lib/mastra-postgres";

export const cerebro = new Mastra({
  agents: {
    complianceAgent,
    onboardingAgent,
  },
  storage: mastraPostgres.mainStore,
});
```

### Package version

- **`@mastra/core`**: see `node_modules/@mastra/core/package.json` → **`version`** (e.g. **1.13.2** at time of writing).

### Workflow / Step API

- The **root** `@mastra/core` export is effectively **`Mastra`** (see `dist/index.d.ts`).
- **`Workflow`**, **`Step`**, **`createStep`**, etc. live under **subpaths** such as `@mastra/core/workflows/evented` (see `node_modules/@mastra/core/dist/workflows/evented/workflow.d.ts` and related files).

---

## 6. BullMQ / Redis

### Queue client — `src/lib/queue/client.ts` (full)

```typescript
import { Queue } from "bullmq";
import Redis from "ioredis";
import { env } from "@/lib/config";
import type { AgentJobPayload, SimulationJobPayload } from "./jobs";

// BullMQ requires maxRetriesPerRequest to be null
const isTls = env.UPSTASH_REDIS_URL.startsWith("rediss://");
export const connection = new Redis(env.UPSTASH_REDIS_URL, {
  maxRetriesPerRequest: null,
  ...(isTls ? { tls: { rejectUnauthorized: false } } : {}),
});

connection.on("connect", () => console.log("[Redis] Connection: CONNECTED"));
connection.on("ready", () => console.log("[Redis] Connection: READY"));
connection.on("error", (err) => console.error("[Redis] Connection: ERROR", err));

/** Standard retry config per database.mdc §Job Retry Configuration */
const defaultJobOptions = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 2000 },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 500 },
};

/**
 * The three canonical BullMQ queues per architecture.md §Queue Separation.
 *
 * - `priority` — event-driven uploads, manual dashboard triggers
 * - `scheduled` — cron-based full vault scans
 * - `simulation` — simulation batch jobs only
 */
export const queues = {
  priority: new Queue<AgentJobPayload>("cerebro-priority", {
    connection: connection as never,
    defaultJobOptions,
  }),
  scheduled: new Queue<AgentJobPayload>("cerebro-scheduled", {
    connection: connection as never,
    defaultJobOptions,
  }),
  simulation: new Queue<SimulationJobPayload>("cerebro-simulation", {
    connection: connection as never,
    defaultJobOptions,
  }),
};
```

- **Workers**: `src/lib/queue/workers.ts` — **`Worker`**, **`Job`** from **`bullmq`**, **`Redis`** from **`ioredis`** (same connection pattern).
- **Env**: the app uses **`UPSTASH_REDIS_URL`** (and optional token in config), **not** `REDIS_URL`. See `.env.example`.

---

## 7. Prisma client

### `src/lib/db/client.ts` (full)

```typescript
import { PrismaClient } from "@prisma/client";
import { env } from "@/lib/config";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.NODE_ENV === "development" ? ["query", "error"] : ["error"],
  });

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

- **Singleton** via **`globalThis`** in non-production.

---

## 8. Database — pgvector / vector SQL

- **`prisma/schema.prisma`**: PostgreSQL datasource only; **no** `vector` extension / `postgresqlExtensions` / pgvector fields.
- **No** project source matches **`<=>`** (vector distance) in `*.{ts,tsx,sql,prisma}` at time of writing.

---

## 9. Environment variables (reference)

- Authoritative template: **`.env.example`** (committed). Typical keys include **`DATABASE_URL`**, **`UPSTASH_REDIS_URL`**, **`UPSTASH_REDIS_TOKEN`**, Supabase URLs/keys, **`OPENROUTER_API_KEY`**, **`RESEND_API_KEY`**, **`DEMO_DATE`**, model tiers, **`DRY_RUN`**, **`NODE_ENV`**, **`WEBHOOK_SECRET`**, optional **`MASTRA_PG_POOL_MAX`**.
- **`src/lib/config.ts`** also defines optional **`GITHUB_SHA`**, **`CRON_SECRET`**, **`SUPABASE_SERVICE_ROLE_KEY`**, **`NEXT_PUBLIC_*`**, etc.
- **`REDIS_URL`**: **not** used; use **`UPSTASH_REDIS_URL`**.
- **Embedding-specific keys**: **none** in the standard env schema documented in `.env.example`.

---

## 10. Testing dashboard UI

### `src/app/testing/TestingPage.tsx` (full)

```tsx
"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import type { EvalRun } from "@prisma/client";
import { EvalOverview } from "@/components/testing/EvalOverview";
import { RegressionTracker } from "@/components/testing/RegressionTracker";
import { ScorerBreakdown } from "@/components/testing/ScorerBreakdown";
import { ScenarioMatrix } from "@/components/testing/ScenarioMatrix";
import { FailureInspector } from "@/components/testing/FailureInspector";
import { GROUND_TRUTH } from "@/evals/ground-truth";

type ScenarioScores = Record<string, { score?: number; reason?: string }>;

type ScenarioBlock = {
  agent: string;
  output?: string;
  error?: string;
  scores: ScenarioScores;
};

export type SerializableEvalRun = Omit<
  EvalRun,
  "scenarioResults" | "scorerBreakdown"
> & {
  scenarioResults: Record<string, ScenarioBlock>;
  scorerBreakdown: Record<string, { total: number; passed: number }>;
};

export default function TestingPage({
  runsInitial,
}: {
  runsInitial: SerializableEvalRun[];
}) {
  const [runs, setRuns] = useState<SerializableEvalRun[]>(runsInitial);
  const [running, setRunning] = useState(false);
  const [selectedCell, setSelectedCell] = useState<{
    clientId: string;
    scorerId: string;
  } | null>(null);

  const latestRun = runs[0];

  const handleRunEval = async () => {
    setRunning(true);
    try {
      const res = await fetch("/api/testing/run", { method: "POST" });
      if (!res.ok) throw new Error("Failed to run evaluations");

      const fresh = await fetch("/api/testing/runs").then((r) => r.json());
      const list: SerializableEvalRun[] = Array.isArray(fresh.data)
        ? fresh.data
        : [];
      setRuns(list);
    } catch (err) {
      console.error(err);
      alert(
        "Error running evaluation: " +
          (err instanceof Error ? err.message : String(err))
      );
    } finally {
      setRunning(false);
    }
  };

  const handleCellClick = (clientId: string, scorerId: string) => {
    setSelectedCell({ clientId, scorerId });
  };

  const getInspectorData = () => {
    if (!selectedCell || !latestRun) return null;
    const { clientId, scorerId } = selectedCell;
    const scenarioResult = latestRun.scenarioResults[clientId];
    const scoreData = scenarioResult?.scores[scorerId];
    const groundTruth = GROUND_TRUTH.find((g) => g.clientId === clientId);

    if (!scenarioResult || !scoreData) return null;

    return {
      clientId,
      agent: scenarioResult.agent,
      scorerId,
      score: scoreData.score ?? 0,
      reason: scoreData.reason ?? "",
      output: scenarioResult.output ?? "",
      expected: groundTruth?.expected,
    };
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center bg-cerebro-surface/30 p-6 rounded-xl border border-cerebro-border/50 backdrop-blur-md">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Testing Suite
          </h1>
          <p className="text-muted-foreground mt-1">
            Stress test agent reasoning against human-verified ground truth.
          </p>
        </div>
        <button
          onClick={handleRunEval}
          disabled={running}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:opacity-50 text-white font-semibold rounded-lg shadow-lg shadow-blue-500/20 transition-all active:scale-95"
        >
          {running ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Running Scenarios...
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-current" />
              Run Evaluation Suite
            </>
          )}
        </button>
      </div>

      {latestRun ? (
        <>
          <EvalOverview
            latestRun={{
              overallScore: latestRun.overallScore,
              runAt: latestRun.runAt,
              scorerBreakdown: latestRun.scorerBreakdown,
              scenarioResults: latestRun.scenarioResults,
            }}
          />
          <div className="grid gap-8 grid-cols-1 lg:grid-cols-4">
            <div className="lg:col-span-4">
              <RegressionTracker
                runs={runs.map((r) => ({
                  id: r.id,
                  overallScore: r.overallScore,
                  runAt: r.runAt,
                }))}
              />
            </div>
          </div>

          <div className="grid gap-8 grid-cols-1 lg:grid-cols-4">
            <div className="lg:col-span-1">
              <ScorerBreakdown breakdown={latestRun.scorerBreakdown} />
            </div>
            <div className="lg:col-span-3">
              <ScenarioMatrix
                results={latestRun.scenarioResults}
                onCellClick={handleCellClick}
              />
            </div>
          </div>

          <FailureInspector
            isOpen={!!selectedCell}
            onClose={() => setSelectedCell(null)}
            data={getInspectorData()}
          />
        </>
      ) : (
        <div className="flex h-[400px] items-center justify-center rounded-lg border border-dashed border-cerebro-border bg-cerebro-surface/50 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2 text-center">
            <h3 className="text-xl font-bold text-foreground">
              No evaluation runs found
            </h3>
            <p className="max-w-sm text-muted-foreground">
              Run <code className="bg-muted px-1.5 py-0.5 rounded text-primary">npm run eval</code>{" "}
              or use the button above to generate evaluation data.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
```

### `src/components/testing/EvalOverview.tsx` (full)

```typescript
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, XCircle, Activity, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface EvalOverviewProps {
  latestRun: {
    overallScore: number;
    runAt: string | Date;
    scorerBreakdown: any;
    scenarioResults: any;
  };
}

export function EvalOverview({ latestRun }: EvalOverviewProps) {
  const scenarioResults = latestRun.scenarioResults || {};
  const totalScenarios = Object.keys(scenarioResults).length;
  const passedScenarios = Object.values(scenarioResults).filter(
    (s: any) => !Object.values(s.scores || {}).some((score: any) => (score.score ?? 0) < 1)
  ).length;
  const failedScenarios = totalScenarios - passedScenarios;

  const metrics = [
    {
      title: "Overall Score",
      value: `${(latestRun.overallScore * 100).toFixed(1)}%`,
      description: "Aggregated scorer performance",
      icon: Activity,
      color: latestRun.overallScore >= 0.8 ? "text-pass" : "text-fail",
    },
    {
      title: "Passing Scenarios",
      value: passedScenarios.toString(),
      description: `Out of ${totalScenarios} total`,
      icon: CheckCircle2,
      color: "text-pass",
    },
    {
      title: "Failing Scenarios",
      value: failedScenarios.toString(),
      description: "Needs attention",
      icon: XCircle,
      color: failedScenarios > 0 ? "text-fail" : "text-muted-foreground",
    },
    {
      title: "Last Run",
      value: formatDistanceToNow(new Date(latestRun.runAt), { addSuffix: true }),
      description: "Evaluation freshiness",
      icon: Clock,
      color: "text-info",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {metrics.map((metric) => (
        <Card key={metric.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{metric.title}</CardTitle>
            <metric.icon className={`h-4 w-4 ${metric.color}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metric.value}</div>
            <p className="text-xs text-muted-foreground">{metric.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

**Note:** `EvalOverview` treats a scenario as passing only if **every** sub-score is **`>= 1`** (strict), which can disagree with fractional scores from `reasoningQualityScorer` vs `run.ts` aggregation.

---

## Related commands

- **`npm run eval`** — runs `src/evals/run.ts` with threshold enforcement.
- **Testing API** — `POST /api/testing/run` triggers `runAllEvals` without threshold (see `src/app/api/testing/run/route.ts`).
- **DB** — results stored in **`EvalRun`** (`prisma/schema.prisma`).
