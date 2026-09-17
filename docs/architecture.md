# Cerebro — System Architecture

> Reference this document for all structural and infrastructure decisions.
> Never deviate from the patterns defined here without updating this doc first.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Repository Structure](#2-repository-structure)
3. [Data Flow Architecture](#3-data-flow-architecture)
4. [Vault Access Control](#4-vault-access-control)
5. [Agent Architecture](#5-agent-architecture)
6. [Event System](#6-event-system)
7. [Queue Architecture](#7-queue-architecture)
8. [API Layer](#8-api-layer)
9. [Real-Time Layer](#9-real-time-layer)
10. [Environment Configuration](#10-environment-configuration)

---

## 1. System Overview

Cerebro is a two-agent autonomous document management system built on top of a replicated FutureVault-style vault infrastructure. It demonstrates that a document vault platform can be extended into a proactive intelligence layer.

```
┌─────────────────────────────────────────────────────────────┐
│                        CEREBRO SYSTEM                        │
│                                                              │
│  ┌──────────────┐          ┌──────────────────────────────┐ │
│  │   NEXT.JS    │          │        AGENT ENGINE          │ │
│  │  DASHBOARD   │◄────────►│                              │ │
│  │              │  RT Sub  │  ┌──────────┐ ┌──────────┐  │ │
│  │  /dashboard  │          │  │Compliance│ │Onboarding│  │ │
│  │  /testing    │          │  │  Agent   │ │  Agent   │  │ │
│  │  /simulation │          │  └────┬─────┘ └────┬─────┘  │ │
│  └──────────────┘          │       │             │        │ │
│                            │       ▼             ▼        │ │
│                            │  ┌──────────────────────┐   │ │
│                            │  │   OpenRouter (LLM)   │   │ │
│                            │  └──────────────────────┘   │ │
│                            └──────────────────────────────┘ │
│                                         │                    │
│  ┌──────────────────────────────────────▼─────────────────┐ │
│  │                    DATA LAYER                           │ │
│  │                                                         │ │
│  │  PostgreSQL (Supabase)    BullMQ (Redis, local Docker)   │ │
│  │  - Vault data             - Priority queue (events)     │ │
│  │  - Documents              - Scheduled queue (scans)     │ │
│  │  - Action logs            - Simulation queue            │ │
│  │  - Agent memory                                         │ │
│  │  - Eval results                                         │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Repository Structure

```
cerebro/
├── .cursor/
│   └── rules/
│       ├── core.mdc
│       ├── agents.mdc
│       ├── database.mdc
│       └── frontend.mdc
├── docs/
│   ├── blueprint.md
│   ├── architecture.md          ← this file
│   ├── data-schema.md
│   └── mastra-patterns.md
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
├── src/
│   ├── agents/
│   │   ├── compliance/
│   │   │   ├── agent.ts         ← Mastra Agent definition
│   │   │   ├── prompts.ts       ← system prompt
│   │   │   └── index.ts
│   │   ├── onboarding/
│   │   │   ├── agent.ts
│   │   │   ├── prompts.ts
│   │   │   └── index.ts
│   │   ├── workflows/
│   │   │   └── complianceHitl.workflow.ts  ← Mastra HITL suspend/resume
│   │   └── mastra.ts            ← single Mastra instance
│   ├── tools/
│   │   ├── shared/
│   │   │   ├── getClientProfile.ts
│   │   │   ├── getActionHistory.ts
│   │   │   ├── getOpenEscalations.ts
│   │   │   ├── getDocumentForReview.ts
│   │   │   ├── getChecklistGaps.ts
│   │   │   ├── getDecisionHistory.ts      ← DecisionRecord observe (read-only)
│   │   │   ├── refreshDocumentExtract.ts
│   │   │   ├── logAction.ts
│   │   │   └── sendAdvisorAlert.ts         ← DRY_RUN email parity
│   │   ├── compliance/
│   │   │   ├── getDocumentComplianceStatus.ts
│   │   │   ├── prioritizeDocuments.ts
│   │   │   ├── requestMissingDocument.ts
│   │   │   ├── checkSanctionsStatus.ts     ← T2.4 seam; never claims vendor clearance
│   │   │   ├── sendClientReminder.ts
│   │   │   ├── escalateToComplianceOfficer.ts
│   │   │   ├── escalateToManagement.ts
│   │   │   ├── markResolved.ts
│   │   │   └── updateDocumentStatus.ts
│   │   └── onboarding/
│   │       ├── getOnboardingStatus.ts
│   │       ├── requestDocument.ts
│   │       ├── validateDocumentReceived.ts ← persists VALID on pass
│   │       ├── advanceOnboardingStage.ts
│   │       ├── completeOnboarding.ts
│   │       ├── sendStageProgressNotice.ts
│   │       ├── sendOnboardingCompleteNotice.ts
│   │       ├── setDocumentStatus.ts
│   │       └── alertAdvisorStuck.ts
│   ├── lib/
│   │   ├── documents/
│   │   │   ├── parser.ts        ← PDF text extract
│   │   │   ├── extract/         ← pluggable field extract adapters (WP-P1.2; docling stub P2.2 watch)
│   │   │   ├── checklist.ts     ← stage/risk checklists + DEMO_DATE validators
│   │   │   ├── injectionHygiene.ts
│   │   │   └── registry.ts
│   │   ├── memory/              ← OM feature-flag helpers + tool-as-subagent stubs (T2.1)
│   │   ├── sanctions/           ← sanctions/PEP check adapter seam (T2.4; dry-run + Alloy stub)
│   │   ├── db/
│   │   │   ├── client.ts        ← Prisma client singleton
│   │   │   └── vault-service.ts ← ALL db access goes through here
│   │   ├── observability/
│   │   │   ├── decision-log.ts  ← DecisionRecord Zod schemas (examiner SoR)
│   │   │   ├── mastra-tracing.ts ← Mastra AI Tracing tags + DefaultExporter
│   │   │   ├── experimentSidecar.ts ← optional Braintrust/LangSmith export (P2.4 watch; default off)
│   │   │   └── evidenceSeal.ts ← pure sha256 seal chain helpers (P2.6 watch; no DB migration)
│   │   ├── orchestration/       ← durable-engine probe for Temporal go/no-go (P2.1 watch)
│   │   ├── routing/             ← hybrid MAS↔SAS cost cascade helpers (P2.7 watch; flag-off)
│   │   ├── queue/
│   │   │   ├── client.ts        ← BullMQ + Redis (`REDIS_URL`) setup
│   │   │   ├── workers.ts       ← queue worker definitions
│   │   │   └── jobs.ts          ← job type definitions
│   │   ├── hitl/                ← durable advisor approve/deny/timeout
│   │   ├── integrations/        ← firm integration watch surfaces (MCP catalog P2.3; not live server)
│   │   ├── email/
│   │   │   └── resend.ts
│   │   ├── policy/              ← stage × tool × auto|approve|block matrix
│   │   └── config.ts            ← MODEL, DEMO_DATE, all env vars
│   ├── workers/                 ← BullMQ: mutation-analysis, shadow-run, online-judge (WP-P1.7)
│   ├── workflows/               ← Meta-agent async pipeline (taxonomy + mutate; REGULATORY freeze)
│   ├── simulation/
│   │   ├── engine.ts
│   │   ├── generator.ts         ← synthetic client generator
│   │   ├── mock-agent.ts        ← rule-based mock for scale runs
│   │   └── metrics.ts
│   ├── evals/
│   │   ├── scorers/
│   │   │   ├── escalationStage.ts
│   │   │   ├── duplicateAction.ts
│   │   │   ├── documentPriority.ts
│   │   │   ├── onboardingStage.ts
│   │   │   ├── trajectory.ts
│   │   │   ├── reasoningQuality.ts
│   │   │   └── agentJudge.ts    ← Agent-as-a-Judge planner stub (P2.5 watch; flag-off; not CI gate)
│   │   ├── fixtures/            ← versioned trajectory JSON for $0 Vitest CI (cheap-eval PR0)
│   │   │   ├── trajectories/    ← golden-pass + seeded-defect fixtures (no OpenRouter)
│   │   │   ├── traces/          ← frozen-trace decision fixtures (SOTA P2.4 watch)
│   │   │   └── frozenTrace.ts   ← hash + in-memory frozen-trace replay gate
│   │   ├── golden/              ← failure→golden export / human promote (WP-P1.5)
│   │   ├── scenarios/
│   │   │   ├── compliance.eval.ts
│   │   │   ├── onboarding.eval.ts
│   │   │   └── goldens/         ← candidates/ (pending) + approved/ (ship gate only)
│   │   ├── hard-gates.ts
│   │   ├── pass-k.ts
│   │   ├── canary-strata.ts     ← stratified canary metadata (cheap-eval PR1)
│   │   ├── scorer-selection.ts  ← canary-ci hard-only vs full + soft short-circuit
│   │   ├── suite-modes.ts       ← canary/full/smoke/clientIds suite selection (cheap-eval PR2)
│   │   ├── judge-cache.ts       ← exact judge-result cache keys (cheap-eval PR3)
│   │   ├── judge-routing.ts     ← AUT/judge stamps, cascade Pilot, soft×pass^k (PR3)
│   │   ├── fixture-ablation.ts  ← tool-mask / prompt-component LOO on fixtures (PR4)
│   │   └── ground-truth.ts
│   └── app/                     ← Next.js App Router
│       ├── api/
│       │   ├── vaults/
│       │   ├── agents/
│       │   ├── simulation/
│       │   └── webhooks/
│       │       └── document-upload/
│       ├── dashboard/
│       ├── testing/
│       └── simulation/
├── tests/
│   ├── tools/
│   ├── agents/
│   └── evals/
│       └── fixtures/            ← Vitest consumers of trajectory fixture bank
└── scripts/
    ├── seed.ts
    └── reset-demo.ts
```

---

## 3. Data Flow Architecture

### Scheduled Agent Run

```
BullMQ Scheduler (cron)
    │
    ▼
Pull all active clientIds from PostgreSQL
    │
    ▼
For each clientId → enqueue job in scheduled-queue
    │
    ▼
BullMQ Worker picks up job
    │
    ▼
Initialize VaultContext(clientId)
    │
    ▼
Load agent memory thread for clientId
    │
    ▼
Run Mastra Agent with vault context
    │
    ├── Agent calls observation tools (read-only)
    ├── Agent calls OpenRouter LLM with context
    ├── Agent calls action tools (writes to DB + logs)
    └── Agent writes decision to memory
    │
    ▼
Emit completion event → Supabase Realtime
    │
    ▼
Dashboard updates live
```

### Event-Driven Agent Run (Document Upload)

```
Document uploaded to vault (mock upload endpoint)
    │
    ▼
Supabase DB webhook fires on documents table INSERT
    │
    ▼
POST /api/webhooks/document-upload
    │
    ▼
Enqueue PRIORITY job in priority-queue (bypasses scheduled-queue)
    │
    ▼
BullMQ Worker picks up immediately
    │
    ▼
Same agent run flow as above
    │
    ▼
Dashboard activity feed marks action with ⚡ event-triggered badge
```

---

## 4. Vault Access Control

**This is the most critical architectural constraint in the system.**

Every agent run is scoped to exactly one `clientId`. No agent tool can ever query or mutate records outside its scoped client. This is enforced at the VaultService layer — not by trust.

### VaultContext Pattern

```typescript
// src/lib/db/vault-service.ts

export type VaultContext = {
  clientId: string
}

export class VaultService {
  private clientId: string

  constructor(ctx: VaultContext) {
    this.clientId = ctx.clientId
  }

  // All methods below scope EVERY query to this.clientId
  // No method accepts a clientId parameter — it is fixed at construction

  async getClientProfile() {
    return prisma.client.findUniqueOrThrow({
      where: { id: this.clientId },
      include: { advisor: true, firm: true }
    })
  }

  async getDocuments() {
    return prisma.document.findMany({
      where: { clientId: this.clientId }
    })
  }

  async logAction(data: LogActionInput) {
    return prisma.agentAction.create({
      data: { ...data, clientId: this.clientId }
    })
  }

  // etc — every method is client-scoped
}
```

### How Tools Receive VaultService

Tools are defined as factory functions that accept a `VaultService` instance. They never construct their own database access.

```typescript
// Agent creates VaultService once per run
const vault = new VaultService({ clientId })

// Tools receive it as part of agent context — never construct it themselves
const tools = buildComplianceTools(vault)

// Agent is initialized with scoped tools
const result = await complianceAgent.generate(prompt, { tools })
```

### Hard Rules

- VaultService is constructed **once per agent run** with a single `clientId`
- Tools **never** import `prisma` directly — only through `VaultService`
- No tool accepts a `clientId` parameter — all scoping happens at construction
- No global Prisma queries exist anywhere in `src/tools/` or `src/agents/`

---

## 5. Agent Architecture

### Single Mastra Instance

One `Mastra` instance is created at `src/agents/mastra.ts` and exported. Both agents are registered on this instance. This instance is imported by the BullMQ worker, never by Next.js route handlers directly.

```typescript
// src/agents/mastra.ts
export const cerebro = new Mastra({
  agents: { complianceAgent, onboardingAgent },
  storage: new PostgresStore({ connectionString: env.DATABASE_URL }),
  logger: new PinoLogger(),
})
```

### Agent Memory Threading

Each client gets a dedicated memory thread identified by their `clientId`. Memory threads are isolated — agent running against Client A never sees Client B's memory.

```
Memory Thread: clientId = "CLT-003"
├── Working memory: { escalationStage: 3, lastAction: "sendClientReminder", ... }
├── Message history: [all previous reasoning turns for this client]
└── Semantic index: [searchable past actions]
```

### Agent Run Lifecycle

```
1. Worker receives job { clientId, trigger: "scheduled" | "event", documentId? }
2. cerebro.getAgent("complianceAgent") retrieves agent instance
3. VaultService constructed with clientId
4. Tools built with VaultService instance
5. Agent memory loaded for clientId thread (via buildAgentMemoryOptions)
6. Agent.generate() called with initial context prompt (maxSteps = AGENT_MAX_STEPS)
7. Agent loops: observe → reason → act (step budget enforced)
8. On completion: memory written, event emitted
9. On error: BullMQ retries up to 3 times with exponential backoff
```

Route handlers **never** call `agent.generate` — they enqueue BullMQ jobs; workers run agents.

### Feature-flag scaffolds (default off)

These land as code on `main` but do **not** change the default production path until explicitly enabled in `src/lib/config.ts`:

| Flag / setting | Default | Intent |
| --- | --- | --- |
| `AGENT_OBSERVATIONAL_MEMORY` | `false` | T2.1 OM helpers; also fail-closed under `DRY_RUN` / `NODE_ENV=test` |
| `SANCTIONS_CHECK_PROVIDER` | `dry-run` | T2.4 sanctions/PEP seam; `alloy` stub is unconfigured (no live vendor) |
| `DOCUMENT_EXTRACT_PROVIDER=docling` | n/a (default `heuristic`) | Docling stub adapter only — no Python sidecar |
| `DURABLE_ENGINE_PROBE` | `false` | Temporal/Inngest go/no-go probe helpers |
| `HYBRID_COST_CASCADE` | `false` | MAS↔SAS cost cascade helpers; worker routing unchanged |
| `EXPERIMENT_SIDECAR` | `off` | Optional Braintrust/LangSmith export; never CI SoR |
| `EVIDENCE_SEAL` | `false` | Pure sha256 seal helpers; no Prisma migration |
| `AGENT_AS_JUDGE` | `false` | Judge planner stub; not a canary/promote gate |
| `MCP_INTEGRATION_SURFACE` | `false` | MCP catalog ⊆ allowlists; no live MCP server |

---

## 6. Event System

### Document Upload Webhook

```
POST /api/webhooks/document-upload

Body: {
  clientId: string
  documentId: string
  documentType: string
  uploadedBy: string       // "client" | "advisor" | "system"
  timestamp: string        // ISO 8601
}
```

This endpoint is called by:
- The mock upload endpoint during live demo
- The simulation engine when simulating client responses
- Supabase DB webhook in production-like configuration

### Event Payload Validation

All webhook payloads are validated with Zod before any processing. Invalid payloads return 400 and are logged — never silently dropped.

### Priority vs Scheduled Queue

```
priority-queue     ← document upload events, manual triggers from dashboard
scheduled-queue    ← cron-based full scans
simulation-queue   ← simulation batch jobs (isolated, never mixes with live)
```

Priority queue jobs always execute before scheduled queue jobs. A client uploading a document during a large scheduled scan is never delayed.

---

## 7. Queue Architecture

### BullMQ Setup

```typescript
// src/lib/queue/client.ts
const connection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null  // required for BullMQ
})

export const priorityQueue = new Queue("cerebro-priority", { connection })
export const scheduledQueue = new Queue("cerebro-scheduled", { connection })
export const simulationQueue = new Queue("cerebro-simulation", { connection })
```

### Worker Configuration

```typescript
// src/lib/queue/workers.ts
const agentWorker = new Worker(
  "cerebro-priority",        // processes priority queue first
  async (job) => {
    const { clientId, agentType, trigger } = job.data
    await runAgent({ clientId, agentType, trigger })
  },
  {
    connection,
    concurrency: 5,           // 5 concurrent agent runs max
    limiter: {
      max: 20,                // 20 jobs per
      duration: 1000,         // second — respects OpenRouter rate limits
    }
  }
)
```

### Job Retry Strategy

```typescript
defaultJobOptions: {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 2000,              // 2s, 4s, 8s
  },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 500 },
}
```

---

## 8. API Layer

All Next.js API routes live in `src/app/api/`. Route handlers never contain business logic — they validate input, call a service function, and return the result.

### Route Map

```
GET  /api/vaults                          → list all vaults with summary
GET  /api/vaults/[clientId]               → full vault detail `{ data: { profile, documents, actions } }`
GET  /api/vaults/[clientId]/documents     → document list
GET  /api/vaults/[clientId]/actions       → action log
GET  /api/vaults/[clientId]/actions/export→ CSV or JSON (`?format=csv|json`) audit export
POST /api/vaults/[clientId]/upload        → mock document upload (triggers event)

POST /api/agents/trigger                  → manually trigger agent run from dashboard (canonical trigger)
GET  /api/agents/status                   → current queue depth and active runs
POST /api/approvals/decide                → advisor HITL approve / edit / deny (enqueues resume job)
GET  /api/approvals/packets               → pending approval packets (ledger + vault evidence)
GET  /api/approvals/packets/[openKey]     → single packet (`?clientId=` required)
GET  /api/approvals/metrics               → firm escalation_rate / timeout_rate SLA metrics

GET  /api/cron/scheduled-scans            → enqueue scheduled scans (secured with `CRON_SECRET`)

POST /api/simulation/start                → start a simulation run (legacy alias if present)
GET  /api/simulation/[runId]              → simulation run status and results
GET  /api/simulation/runs                 → list past simulation runs; POST starts a new run

POST /api/webhooks/document-upload        → receives upload events
```

### Route Handler Pattern

```typescript
// All route handlers follow this pattern
export async function GET(
  req: Request,
  { params }: { params: { clientId: string } }
) {
  const parsed = clientIdSchema.safeParse(params.clientId)
  if (!parsed.success) return Response.json({ error: "Invalid" }, { status: 400 })

  const data = await vaultService.getSomething(parsed.data)
  return Response.json(data)
}
```

---

## 9. Real-Time Layer

Supabase Realtime powers all live dashboard updates. The dashboard subscribes to two channels:

### Channel 1: Agent Actions Feed

```typescript
supabase
  .channel("agent-actions")
  .on("postgres_changes", {
    event: "INSERT",
    schema: "public",
    table: "agent_actions",
  }, (payload) => {
    // Update activity feed
    // Update affected vault row status
    // Recalculate firm-wide compliance score
  })
  .subscribe()
```

### Channel 2: Simulation Progress

```typescript
supabase
  .channel("simulation-progress")
  .on("postgres_changes", {
    event: "UPDATE",
    schema: "public",
    table: "simulation_runs",
  }, (payload) => {
    // Update progress bar
    // Update running metrics cards
  })
  .subscribe()
```

---

## 10. Environment Configuration

All configuration lives in `src/lib/config.ts`. Never read `process.env` directly anywhere else. Use `getModel("dev" | "demo" | "evalJudge")` for LLM instances — never hardcode model id strings outside config.

Authoritative schema and defaults: `src/lib/config.ts` and `.env.example`. Highlights:

- **`DRY_RUN`** defaults to **`true`** — emails/external side effects suppressed; DB writes still occur.
- **`DEMO_DATE`** — all date logic relative to this (never `new Date()` directly).
- **`MODEL_*` / `getModel`** — AUT uses `dev`; soft judges use `evalJudge` only.
- **Cheap-eval:** `CI_LIVE_EVAL` (default false), `EVAL_ALLOW_FULL_IN_CI` (default false), suite modes in `src/evals/suite-modes.ts`.
- **Scaffolds:** see [Feature-flag scaffolds](#feature-flag-scaffolds-default-off) above.

### DEMO_DATE

All document expiry logic is computed relative to `DEMO_DATE`, not `new Date()`. This ensures mock data never goes stale and the demo can be run at any time without re-seeding.

```typescript
// Correct — always use this
import { env } from "@/lib/config"
const today = new Date(env.DEMO_DATE)
const daysUntilExpiry = differenceInDays(doc.expiryDate, today)

// Never do this
const daysUntilExpiry = differenceInDays(doc.expiryDate, new Date())
```

### DRY_RUN

Before any email, webhook, or vendor call, check `env.DRY_RUN` (and typically `NODE_ENV === "test"`). Action tools still call `vault.logAction` with a dry-run outcome so the audit trail remains complete.
