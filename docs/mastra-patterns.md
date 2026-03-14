# Cerebro — Mastra Patterns

> Reference this document whenever writing agent, tool, memory, workflow, or eval code.
> Every pattern here is the canonical way to do it in this project — do not deviate.

---

## Table of Contents

1. [Mastra Instance Setup](#1-mastra-instance-setup)
2. [Defining an Agent](#2-defining-an-agent)
3. [OpenRouter Model Configuration](#3-openrouter-model-configuration)
4. [Defining a Tool](#4-defining-a-tool)
5. [Tool Categories and Patterns](#5-tool-categories-and-patterns)
6. [Agent Memory](#6-agent-memory)
7. [Running an Agent](#7-running-an-agent)
8. [Agent System Prompts](#8-agent-system-prompts)
9. [Defining an Eval](#9-defining-an-eval)
10. [Custom Scorers](#10-custom-scorers)
11. [Running Evals](#11-running-evals)
12. [Error Handling Patterns](#12-error-handling-patterns)
13. [Dry Run Mode](#13-dry-run-mode)

---

## 1. Mastra Instance Setup

One instance. Exported from one file. Imported everywhere else.

```typescript
// src/agents/mastra.ts

import { Mastra } from "@mastra/core"
import { PostgresStore } from "@mastra/memory/stores/postgres"
import { complianceAgent } from "./compliance/agent"
import { onboardingAgent } from "./onboarding/agent"
import { env } from "@/lib/config"

export const cerebro = new Mastra({
  agents: {
    complianceAgent,
    onboardingAgent,
  },
  storage: new PostgresStore({
    connectionString: env.DATABASE_URL,
  }),
})
```

**Rules:**
- Never instantiate `Mastra` anywhere except `src/agents/mastra.ts`
- Never import agents directly into Next.js route handlers — always go through `cerebro`
- The `cerebro` instance is only imported by the BullMQ worker process

---

## 2. Defining an Agent

```typescript
// src/agents/compliance/agent.ts

import { Agent } from "@mastra/core"
import { createMemory } from "@mastra/memory"
import { COMPLIANCE_SYSTEM_PROMPT } from "./prompts"
import { getModel } from "@/lib/config"
import {
  getClientProfile,
  getActionHistory,
  logAction,
  sendAdvisorAlert,
} from "@/tools/shared"
import {
  getDocumentComplianceStatus,
  sendClientReminder,
  escalateToComplianceOfficer,
  escalateToManagement,
  updateDocumentStatus,
} from "@/tools/compliance"

export const complianceAgent = new Agent({
  name: "Cerebro Compliance Agent",
  instructions: COMPLIANCE_SYSTEM_PROMPT,
  model: getModel("dev"),        // resolved from config — never hardcoded
  tools: {
    getClientProfile,
    getActionHistory,
    logAction,
    sendAdvisorAlert,
    getDocumentComplianceStatus,
    sendClientReminder,
    escalateToComplianceOfficer,
    escalateToManagement,
    updateDocumentStatus,
  },
  memory: createMemory({
    lastMessages: 20,             // keep last 20 turns in context
  }),
})
```

**Rules:**
- `model` always comes from `getModel()` — never a hardcoded string
- `memory` is always configured — never omit it
- All tool imports are explicit — no dynamic tool loading

---

## 3. OpenRouter Model Configuration

```typescript
// src/lib/config.ts

import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { env } from "./env"   // validated env object

const openrouter = createOpenRouter({
  apiKey: env.OPENROUTER_API_KEY,
})

// Model tiers — swap the string to change models globally
const MODELS = {
  dev:        "google/gemini-2.0-flash",         // cheap, fast — for dev/simulation
  demo:       "anthropic/claude-haiku-4-5",      // stronger — for live demo
  evalJudge:  "google/gemini-flash-1.5",         // cheapest judge model
} as const

export type ModelTier = keyof typeof MODELS

export function getModel(tier: ModelTier = "dev") {
  return openrouter(MODELS[tier])
}
```

**Usage in agents:**
```typescript
model: getModel("dev")      // development
model: getModel("demo")     // live demo — switch via env or function call
model: getModel("evalJudge") // inside eval scorers only
```

**Rules:**
- Never write a model string like `"google/gemini-2.0-flash"` outside of `config.ts`
- Pass `"demo"` tier during live demo presentation
- Pass `"dev"` tier during all development and simulation runs

---

## 4. Defining a Tool

Every tool follows this exact structure. No exceptions.

```typescript
// src/tools/compliance/getDocumentComplianceStatus.ts

import { createTool } from "@mastra/core"
import { z } from "zod"
import type { VaultService } from "@/lib/db/vault-service"

// Input schema — what the agent passes in
const inputSchema = z.object({
  includeValid: z.boolean()
    .default(false)
    .describe("Whether to include valid documents in the response or only problem documents"),
})

// Output schema — what the tool returns to the agent
const outputSchema = z.object({
  documents: z.array(z.object({
    documentId:       z.string(),
    type:             z.string(),
    label:            z.string(),
    status:           z.string(),
    daysUntilExpiry:  z.number().nullable(),
    notificationCount: z.number(),
    lastNotifiedAt:   z.string().nullable(),
    urgency:          z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW", "NONE"]),
    regulatoryNote:   z.string(),
  })),
  summary: z.object({
    totalDocuments:   z.number(),
    expiredCount:     z.number(),
    expiringSoonCount: z.number(),
    missingCount:     z.number(),
    highestUrgency:   z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW", "NONE"]),
  }),
})

// Factory function — tool receives VaultService at construction, not via input
export function buildGetDocumentComplianceStatus(vault: VaultService) {
  return createTool({
    id:          "getDocumentComplianceStatus",
    description: "Retrieves the compliance status of all documents in this client's vault. Returns urgency levels and days until expiry. Always call this first in a compliance run.",
    inputSchema,
    outputSchema,
    execute: async ({ context }) => {
      const { includeValid } = context

      const documents = await vault.getDocuments()
      // ... processing logic
      return { documents: processedDocs, summary }
    },
  })
}
```

**Rules:**
- Tools are always factory functions (`buildToolName(vault: VaultService)`) — never constructed without vault context
- `inputSchema` and `outputSchema` are always defined — never use `z.any()`
- `description` must tell the agent exactly when to use this tool and what it returns
- Observation tools: `execute` only reads from `vault.*` methods
- Action tools: `execute` always calls `vault.logAction()` before returning

---

## 5. Tool Categories and Patterns

### Observation Tool Pattern (read-only)

```typescript
execute: async ({ context }) => {
  // ONLY reads — no writes, no side effects, no emails
  const data = await vault.getSomething()
  return processedData
}
```

### Action Tool Pattern (writes + external effects)

```typescript
execute: async ({ context }) => {
  const { dryRun } = env  // check dry run mode

  // 1. Validate prerequisites
  if (/* precondition not met */) {
    throw new Error("Prerequisite not met: [explain what is missing]")
  }

  // 2. Execute external effect (only if not dry run)
  if (!dryRun) {
    await resend.emails.send({ ... })
  }

  // 3. ALWAYS log the action — even in dry run mode
  await vault.logAction({
    actionType: "SEND_CLIENT_REMINDER",
    reasoning:  context.reasoning,      // agent passes its reasoning
    outcome:    dryRun ? "DRY_RUN" : "EMAIL_SENT",
    nextScheduledAt: addDays(new Date(env.DEMO_DATE), 5),
  })

  return { success: true, dryRun }
}
```

### Escalation Tool Pattern (prerequisite enforcement)

```typescript
execute: async ({ context }) => {
  // Escalation tools SELF-ENFORCE prerequisites
  // The agent cannot skip stages even if it tries

  const history = await vault.getActionHistory()
  const previousStageCompleted = history.some(
    a => a.actionType === "ESCALATE_COMPLIANCE"  // stage 4 requires stage 3 done
  )

  if (!previousStageCompleted) {
    throw new Error(
      "Cannot escalate to management: compliance officer escalation has not occurred. " +
      "Complete stage 4 (ESCALATE_COMPLIANCE) first."
    )
  }

  // ... proceed with escalation
}
```

---

## 6. Agent Memory

Mastra memory is scoped per client via a `resourceId`. Every agent run opens the memory thread for that specific client.

### Memory Thread Identification

```typescript
// When running an agent, always pass resourceId = clientId
const result = await cerebro
  .getAgent("complianceAgent")
  .generate(prompt, {
    resourceId: clientId,     // ← this scopes memory to this client
    threadId:   clientId,     // ← use same value — one thread per client per agent
  })
```

### Working Memory Schema

The structured data the agent maintains across runs for each client:

```typescript
// src/agents/compliance/memory-schema.ts

export const COMPLIANCE_WORKING_MEMORY_SCHEMA = z.object({
  currentEscalationStage: z.number().min(0).max(5).default(0),
  lastActionType:         z.string().nullable().default(null),
  lastActionDate:         z.string().nullable().default(null),
  notificationCounts:     z.record(z.string(), z.number()).default({}),
  isEscalated:            z.boolean().default(false),
  escalatedTo:            z.enum(["ADVISOR", "COMPLIANCE_OFFICER", "MANAGEMENT"]).nullable().default(null),
  openIssues:             z.array(z.string()).default([]),
})

export const ONBOARDING_WORKING_MEMORY_SCHEMA = z.object({
  currentStage:           z.number().min(0).max(4).default(0),
  lastDocumentRequested:  z.string().nullable().default(null),
  lastRequestDate:        z.string().nullable().default(null),
  stageStartDate:         z.string().nullable().default(null),
  advisorAlerted:         z.boolean().default(false),
  completedStages:        z.array(z.number()).default([]),
})
```

### Memory Anti-Patterns

```typescript
// ❌ WRONG — checking memory via string search
const alreadyNotified = history.filter(a => a.actionType.includes("REMIND"))

// ✅ CORRECT — check against specific enum values
const alreadyNotified = history.some(
  a => a.actionType === "SEND_CLIENT_REMINDER" &&
       isAfter(new Date(a.performedAt), subDays(new Date(env.DEMO_DATE), 5))
)
```

---

## 7. Running an Agent

The BullMQ worker is the only place that runs agents. API routes enqueue jobs — they do not run agents directly.

```typescript
// src/lib/queue/workers.ts

async function runAgent({
  clientId,
  agentType,
  trigger,
  documentId,
}: AgentJobPayload) {

  // 1. Build scoped vault service
  const vault = new VaultService({ clientId })

  // 2. Build tools with vault context
  const tools = agentType === "COMPLIANCE"
    ? buildComplianceTools(vault)
    : buildOnboardingTools(vault)

  // 3. Build initial context prompt
  const client = await vault.getClientProfile()
  const prompt = buildInitialPrompt({ client, trigger, documentId })

  // 4. Get agent from Mastra instance
  const agent = cerebro.getAgent(
    agentType === "COMPLIANCE" ? "complianceAgent" : "onboardingAgent"
  )

  // 5. Run with client-scoped memory
  const result = await agent.generate(prompt, {
    resourceId: clientId,
    threadId:   clientId,
    tools,       // override with vault-scoped tool instances
  })

  // 6. Emit completion event
  await emitAgentCompletion({ clientId, agentType, trigger, result })

  return result
}
```

### Initial Context Prompt Shape

```typescript
function buildInitialPrompt({ client, trigger, documentId }) {
  const base = `
You are running a ${agentType} check for client: ${client.name} (ID: ${client.id}).
Advisor: ${client.advisor.name} | Firm: ${client.firm.name}
Account Type: ${client.accountType}
Today's Date: ${env.DEMO_DATE}

Trigger: ${trigger === "EVENT_UPLOAD" ? `Document uploaded (ID: ${documentId}) — evaluate immediately` : "Scheduled scan"}

Begin by calling getActionHistory to understand what has already been done for this client.
Then call the appropriate observation tool. Then decide on the correct action.
`
  return base.trim()
}
```

---

## 8. Agent System Prompts

### Compliance Agent System Prompt

```typescript
// src/agents/compliance/prompts.ts

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
`.trim()
```

### Onboarding Agent System Prompt

```typescript
// src/agents/onboarding/prompts.ts

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
`.trim()
```

---

## 9. Defining an Eval

Each eval scenario defines an input state and the expected correct agent decision.

```typescript
// src/evals/scenarios/compliance.eval.ts

import { Eval } from "@mastra/evals"
import { complianceAgent } from "@/agents/compliance/agent"
import {
  escalationStageScorer,
  duplicateActionScorer,
  documentPriorityScorer,
  reasoningQualityScorer,
} from "@/evals/scorers"

export const complianceEvals = new Eval(complianceAgent, {
  scorers: [
    escalationStageScorer,
    duplicateActionScorer,
    documentPriorityScorer,
    reasoningQualityScorer,
  ],
  testCases: [
    {
      // Scenario: First time detecting expired KYC — should notify advisor
      input: {
        prompt: buildEvalPrompt({
          clientId: "EVAL-001",
          scenario: "KYC expired 5 days ago, no previous actions",
        }),
        resourceId: "EVAL-001",
        threadId:   "EVAL-001",
      },
      expected: {
        actionTaken:      "NOTIFY_ADVISOR",
        escalationStage:  1,
        duplicateAction:  false,
        highestPriority:  "CRITICAL",
      },
    },
    {
      // Scenario: Advisor notified 6 days ago, no response — should send client reminder
      input: {
        prompt: buildEvalPrompt({
          clientId: "EVAL-002",
          scenario: "KYC expired, advisor notified 6 days ago, no response",
        }),
        resourceId: "EVAL-002",
        threadId:   "EVAL-002",
      },
      expected: {
        actionTaken:     "SEND_CLIENT_REMINDER",
        escalationStage: 2,
        duplicateAction: false,
      },
    },
    // ... more test cases for all 15 mock client scenarios
  ],
})
```

---

## 10. Custom Scorers

```typescript
// src/evals/scorers/escalationStage.ts

import { createScorer } from "@mastra/evals"

export const escalationStageScorer = createScorer({
  name: "escalationStageScorer",
  description: "Verifies the agent chose the correct escalation stage given action history",

  score: async ({ output, expected }) => {
    const actionTaken = extractActionFromOutput(output)
    const correctStage = expected.escalationStage

    // Check the action matches the expected stage
    const stageActionMap: Record<number, string> = {
      1: "NOTIFY_ADVISOR",
      2: "SEND_CLIENT_REMINDER",
      3: "SEND_CLIENT_REMINDER",
      4: "ESCALATE_COMPLIANCE",
      5: "ESCALATE_MANAGEMENT",
    }

    const expectedAction = stageActionMap[correctStage]
    const correct = actionTaken === expectedAction

    return {
      score: correct ? 1 : 0,
      reason: correct
        ? `Correctly chose ${actionTaken} for stage ${correctStage}`
        : `Expected ${expectedAction} for stage ${correctStage}, got ${actionTaken}`,
    }
  },
})
```

```typescript
// src/evals/scorers/reasoningQuality.ts
// Uses LLM-as-judge — uses cheapest model tier

import { createScorer } from "@mastra/evals"
import { generateText } from "ai"
import { getModel } from "@/lib/config"

export const reasoningQualityScorer = createScorer({
  name: "reasoningQualityScorer",
  description: "Assesses whether the agent's logged reasoning is specific, accurate, and regulatory-aware",

  score: async ({ output }) => {
    const reasoning = extractReasoningFromOutput(output)

    const { text } = await generateText({
      model: getModel("evalJudge"),   // cheapest judge model
      prompt: `
You are evaluating compliance agent reasoning quality.

Reasoning to evaluate:
"${reasoning}"

Score from 0.0 to 1.0 based on:
- Is it specific to this client's situation? (not generic)
- Does it reference the correct regulatory requirement?
- Does it correctly identify the urgency level?
- Does it explain why this action and not another?

Respond with JSON only: { "score": 0.0-1.0, "reason": "brief explanation" }
`,
    })

    const parsed = JSON.parse(text)
    return { score: parsed.score, reason: parsed.reason }
  },
})
```

---

## 11. Running Evals

```typescript
// src/evals/run.ts — called by Vitest

import { runEvals } from "@mastra/evals"
import { complianceEvals } from "./scenarios/compliance.eval"
import { onboardingEvals } from "./scenarios/onboarding.eval"
import { prisma } from "@/lib/db/client"

export async function runAllEvals() {
  const results = await runEvals([complianceEvals, onboardingEvals])

  // Persist results for the testing dashboard
  await prisma.evalRun.create({
    data: {
      gitCommit:      process.env.GITHUB_SHA ?? "local",
      overallScore:   results.overallScore,
      scenarioResults: results.scenarioResults,
      scorerBreakdown: results.scorerBreakdown,
    },
  })

  // Fail CI if below threshold
  if (results.overallScore < 0.80) {
    throw new Error(
      `Eval score ${results.overallScore} below threshold 0.80. ` +
      `Check failing scenarios before merging.`
    )
  }

  return results
}
```

```bash
# Run evals locally
npx vitest run src/evals/run.ts

# Run with verbose output
EVAL_VERBOSE=true npx vitest run src/evals/run.ts
```

---

## 12. Error Handling Patterns

### Agent Run Error Handling

```typescript
// In BullMQ worker — wraps every agent run
try {
  await runAgent(job.data)
} catch (error) {
  // Log to audit trail even on failure — never silently drop
  await prisma.agentAction.create({
    data: {
      clientId:   job.data.clientId,
      agentType:  job.data.agentType,
      actionType: "SCAN_VAULT",
      reasoning:  `Agent run failed: ${error.message}`,
      outcome:    "ERROR",
    },
  })

  // BullMQ will retry automatically per job options
  throw error
}
```

### Tool Error Handling

```typescript
// Tools throw descriptive errors — never return null or undefined on failure
execute: async ({ context }) => {
  const client = await vault.getClientProfile().catch(() => {
    throw new Error(
      `Failed to load client profile for vault. ` +
      `This should never happen — check VaultService initialization.`
    )
  })
  // ...
}
```

---

## 13. Dry Run Mode

All action tools check `env.DRY_RUN` before sending external communications.
In dry run mode: no emails sent, no external calls made, but all DB writes still happen.

```typescript
// Standard dry run check in every action tool
const isDryRun = env.DRY_RUN || env.NODE_ENV === "test"

if (!isDryRun) {
  await resend.emails.send({ ... })
}

// Log always happens regardless of dry run
await vault.logAction({
  actionType: "SEND_CLIENT_REMINDER",
  outcome:    isDryRun ? "DRY_RUN_EMAIL" : "EMAIL_SENT",
  reasoning:  context.reasoning,
})
```

**When dry run is active:**
- All evals: always dry run
- All simulation runs: always dry run
- Development: set `DRY_RUN=true` in `.env.local`
- Live demo: set `DRY_RUN=false` to send real emails to demo addresses
