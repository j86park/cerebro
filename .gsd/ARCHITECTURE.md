# Cerebro ARCHITECTURE

## 1. System Overview

Cerebro is a two-agent autonomous document management system built on top of a replicated FutureVault-style vault infrastructure. It demonstrates that a document vault platform can be extended into a proactive intelligence layer.

```text
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
│  │  PostgreSQL (Supabase)    BullMQ (Upstash Redis)        │ │
│  │  - Vault data             - Priority queue (events)     │ │
│  │  - Documents              - Scheduled queue (scans)     │ │
│  │  - Action logs            - Simulation queue            │ │
│  │  - Agent memory                                         │ │
│  │  - Eval results                                         │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## 2. Repository Structure

```text
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
│   │   └── mastra.ts            ← single Mastra instance
│   ├── tools/
│   │   ├── shared/
│   │   │   ├── getClientProfile.ts
│   │   │   ├── getActionHistory.ts
│   │   │   ├── logAction.ts
│   │   │   └── sendAdvisorAlert.ts
│   │   ├── compliance/
│   │   │   ├── getDocumentComplianceStatus.ts
│   │   │   ├── sendClientReminder.ts
│   │   │   ├── escalateToComplianceOfficer.ts
│   │   │   ├── escalateToManagement.ts
│   │   │   └── updateDocumentStatus.ts
│   │   └── onboarding/
│   │       ├── getOnboardingStatus.ts
│   │       ├── requestDocument.ts
│   │       ├── validateDocumentReceived.ts
│   │       ├── advanceOnboardingStage.ts
│   │       ├── completeOnboarding.ts
│   │       └── alertAdvisorStuck.ts
│   ├── lib/
│   │   ├── db/
│   │   │   ├── client.ts        ← Prisma client singleton
│   │   │   └── vault-service.ts ← ALL db access goes through here
│   │   ├── queue/
│   │   │   ├── client.ts        ← BullMQ + Upstash Redis setup
│   │   │   ├── workers.ts       ← queue worker definitions
│   │   │   └── jobs.ts          ← job type definitions
│   │   ├── email/
│   │   │   └── resend.ts
│   │   └── config.ts            ← MODEL, DEMO_DATE, all env vars
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
│   │   │   └── reasoningQuality.ts
│   │   ├── scenarios/
│   │   │   ├── compliance.eval.ts
│   │   │   └── onboarding.eval.ts
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
│   └── agents/
└── scripts/
    ├── seed.ts
    └── reset-demo.ts
```

## 3. Vault Access Control

This is the most critical architectural constraint in the system. Every agent run is scoped to exactly one `clientId`. No agent tool can ever query or mutate records outside its scoped client. This is enforced at the VaultService layer — not by trust.

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

Tools are defined as factory functions that accept a `VaultService` instance. They never construct their own database access.

## 4. Data Flow Architecture

### Scheduled Agent Run

```text
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

```text
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

## 5. Queue Architecture

The BullMQ setup separates queues by priority to ensure real-time responsiveness.
- `priority-queue`: document upload events, manual triggers from dashboard
- `scheduled-queue`: cron-based full scans
- `simulation-queue`: simulation batch jobs (isolated, never mixes with live)

Workers limit concurrency (e.g., 5 concurrent priority jobs, 3 scheduled jobs) to manage load and conform to OpenRouter/LLM rate limits.

## 6. API Layer Route Map

All route handlers are strictly thin layers validating input, calling services, and returning objects:

```text
GET  /api/vaults                          → list all vaults with summary
GET  /api/vaults/[clientId]               → full vault detail
GET  /api/vaults/[clientId]/documents     → document list
GET  /api/vaults/[clientId]/actions       → action log
POST /api/vaults/[clientId]/upload        → mock document upload (triggers event)

POST /api/agents/trigger                  → manually trigger agent run from dashboard
GET  /api/agents/status                   → current queue depth and active runs

POST /api/simulation/start                → start a simulation run
GET  /api/simulation/[runId]              → simulation run status and results
GET  /api/simulation/runs                 → list all past simulation runs

POST /api/webhooks/document-upload        → receives upload events (returns 202)
```

## 7. Real-Time Layer

Supabase Realtime powers the live dashboard updates via two channels:
1. `cerebro-agent-actions` listens to `INSERT` on `agent_actions` to update the vault rows, firm compliance score, and activity feed.
2. `cerebro-simulation-[runId]` listens to `UPDATE` on `simulation_runs` for live progress tracking. 

## 8. Environment Configuration (DEMO_DATE Pattern)

All date logic is computed relative to an environment variable `DEMO_DATE`, avoiding issues with mock data becoming stale over time. For example, document expiry is calculated as the difference between `doc.expiryDate` and `env.DEMO_DATE`, never `new Date()`. This guarantees stable demo experiences without continuous re-seeding. All environment vars are strictly parsed with Zod in `src/lib/config.ts`.
