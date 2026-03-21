# FutureVault cerebro— Project Blueprint

> **Status:** Pre-build Planning Document  
> **Version:** 1.0  
> **Agents:** Compliance Agent + Onboarding Agent  
> **Framework:** Mastra (TypeScript)

---

## Table of Contents

1. [Project Description](#1-project-description)
2. [Requirements](#2-requirements)
3. [Tech Stack](#3-tech-stack)
4. [Build Steps](#4-build-steps)
   - [Step 1 — Mock Data](#step-1--mock-data)
   - [Step 2 — Vault System Replication](#step-2--vault-system-replication)
   - [Step 3 — Agent Core](#step-3--agent-core)
   - [Step 4 — Tool System](#step-4--tool-system)
   - [Step 5 — Operations Dashboard](#step-5--operations-dashboard)
   - [Step 6 — Testing System](#step-6--testing-system)
   - [Step 7 — Testing Dashboard](#step-7--testing-dashboard)
   - [Step 8 — Simulation Engine](#step-8--simulation-engine)
   - [Step 9 — Simulation Visualization](#step-9--simulation-visualization)
   - [Step 10 — Scale Testing Infrastructure](#step-10--scale-testing-infrastructure)

---

## 1. Project Description

### What We Are Building

An autonomous AI agent layer built on top of a replicated FutureVault-style document vault system. Two specialized agents — a **Compliance Agent** and an **Onboarding Agent** — continuously monitor client vaults, detect issues, and take escalating autonomous actions to resolve them without human intervention until genuinely necessary.

This system demonstrates that FutureVault's existing document infrastructure can be extended into a proactive intelligence layer — not just a place documents sit, but a system that actively manages the entire document lifecycle at enterprise scale.

### The Two Agents

**Compliance Agent**
Monitors all existing client vaults continuously. Detects regulatory document issues — expired KYC forms, missing AML verification, outdated risk questionnaires — and autonomously escalates through a defined action ladder from advisor alert to compliance officer to firm management. Every action is logged with full reasoning for a complete audit trail.

**Onboarding Agent**
Takes ownership of every new client from the moment they are created. Drives document collection through a staged pipeline, sending requests, following up on non-responses, validating submitted documents, advancing stages when complete, and escalating to the advisor when a client is stuck beyond acceptable thresholds.

### The Core Value Proposition

> *Every other platform tells you something is wrong. Cerebro's agents fix it.*

### Three Demo Personas

| Persona | Scenario | Primary Agent |
|---|---|---|
| **Alex Chen** | Brand new client, zero documents uploaded | Onboarding Agent |
| **Sarah Mitchell** | 5-year client, one document expiring in 45 days | Compliance Agent (proactive mode) |
| **Robert Park** | Lapsed client, KYC expired, advisor unresponsive | Compliance Agent (full escalation) |

---

## 2. Requirements

### Functional Requirements

**Vault System**
- Each client must have an isolated vault that agents can only access via scoped credentials
- Vaults must hold documents with full metadata — type, status, expiry, upload date, notification history
- The system must support a firm hierarchy — firm → advisor → client
- Document status transitions must be tracked and auditable

**Compliance Agent**
- Must scan all vaults on a defined schedule
- Must detect expired documents, documents expiring within 30/14/7 day thresholds, and missing required documents
- Must follow a five-stage escalation ladder without skipping stages
- Must not repeat actions already taken — agent memory is required
- Must log every decision with reasoning and timestamp
- Must support human-in-the-loop at escalation stage 4+

**Onboarding Agent**
- Must trigger automatically when a new client vault is created
- Must know which documents are required for each account type and onboarding stage
- Must track non-response and escalate follow-ups on schedule
- Must validate that received documents match what was requested
- Must advance the onboarding stage automatically when all documents for a stage are received
- Must alert the assigned advisor when a client is stuck beyond threshold days

**Event-Driven Agent Triggers**
- Both agents must respond to vault file upload events in real time, not just on scheduled scans
- When a new document is added to any vault, the system must emit an event that triggers the relevant agent immediately
- The Compliance Agent must re-evaluate a client's compliance status the moment a new document lands in their vault — it may resolve an open issue or introduce a new one
- The Onboarding Agent must detect when a requested document has been uploaded, validate it, and immediately advance the onboarding stage if all stage requirements are now met
- Events must be queued and processed reliably — a document upload must never be silently missed
- The event system must handle bursts — a firm bulk-uploading hundreds of documents simultaneously must not overwhelm the agent queue
- Agents must be stateless at the code level — all state lives in the database
- Agents must never access a vault they are not scoped to
- All agent actions must be reversible or at minimum fully logged
- Agents must handle API failures gracefully with retry logic

### Non-Functional Requirements

- The system must be demonstrable with 15 pre-loaded mock clients
- The simulation engine must be capable of running 10,000+ virtual client scenarios
- The dashboard must update in real-time as agents take actions
- The audit log must be queryable and exportable
- The system must be deployable to a public URL for sharing before the demo

### Data Requirements

- 15 mock clients covering all defined scenarios
- 3 mock advisors across 2 mock firms
- Full document metadata for every document type in scope
- Historical action logs pre-populated for demo realism
- Simulation seed data for scale testing

---

## 3. Tech Stack

Every package below was selected for a specific reason. Nothing is included speculatively.

### Core Framework

**`@mastra/core`** — The primary agent framework. **100% free and open source under the Apache 2.0 license — no seats, no usage tiers, no paid plans.** Provides the `Agent` class, `Tool` system, `Workflow` orchestration, built-in memory, and the `Mastra` instance that wires everything together. Chosen over Vercel AI SDK (lacks workflow orchestration and memory), LangChain (too heavy, poor TypeScript ergonomics), and raw API calls (no tool loop management, no memory, more manual work). Mastra is TypeScript-native, built on top of the Vercel AI SDK, and purpose-built for exactly this use case. The only costs incurred are the LLM API calls routed through OpenRouter — the framework itself is zero cost.

**`@mastra/evals`** — Mastra's built-in evaluation framework. Provides model-graded, rule-based, and statistical scorers for measuring agent decision quality across thousands of test runs. Integrates directly with Vitest for CI pipeline testing and the Mastra Studio for visual result inspection.

**`@mastra/memory`** — Agent memory module. Provides persistent working memory and semantic recall so agents remember what actions they have already taken for each client across multiple runs. This is what prevents the agent from sending duplicate reminders.

### AI Model

**`@openrouter/ai-sdk-provider`** — OpenRouter provider adapter for the AI SDK that Mastra is built on. OpenRouter acts as a unified gateway to 300+ models from every major provider — OpenAI, Anthropic, Google, Meta, Mistral, and more — through a single API key and billing account. This is the right choice for this project for three reasons: it eliminates vendor lock-in so the best model for each task can be selected freely, it enables cost optimization by routing cheap tasks to cheap models, and it future-proofs the system so the model can be swapped without touching agent logic.

**Model Strategy — Cost-Optimized Routing:**

| Task | Model | Why |
|---|---|---|
| Agent reasoning (live demo) | `google/gemini-2.0-flash` or `anthropic/claude-haiku-4-5` | Fast, cheap, strong reasoning |
| Agent reasoning (accuracy evals) | `anthropic/claude-sonnet-4-5` or `openai/gpt-4o` | Higher accuracy for validation runs |
| Eval judge (`reasoningQualityScorer`) | `google/gemini-flash-1.5` | Cheapest capable judge model |
| Simulation mock reasoning | Rule-based engine — no LLM call | Zero cost at scale |

The model used at any point is a configuration value, not hardcoded. Switching from Gemini Flash to Claude Sonnet for a high-stakes demo run is a one-line config change.

### Frontend

**`Next.js 15`** (App Router) — Full-stack React framework powering both the operations dashboard and testing dashboard. Chosen because FutureVault themselves run Next.js, it handles API routes and server components in one codebase, and it integrates natively with Vercel deployment.

**`Tailwind CSS v4`** — Utility-first CSS framework for building the dashboard UI rapidly without writing custom CSS.

**`shadcn/ui`** — Unstyled, accessible component library built on Radix UI. Provides data tables, cards, badges, progress bars, alert dialogs, and the full component set needed for an enterprise dashboard — all in a consistent, professional visual style. Zero design work required for demo-quality UI.

**`Recharts`** — React charting library for simulation results visualization. Handles line charts, bar charts, area charts, and the animated timeline views used in the scale testing dashboard.

### Backend

**`TypeScript`** — Strict typing enforced across the entire codebase. Given the complexity of vault state, document metadata, and agent decision objects, TypeScript type safety prevents entire categories of runtime bugs.

**`Zod`** — Schema validation library used to define and validate the shape of every vault object, document record, tool input, and agent decision. Mastra uses Zod natively for tool parameter schemas.

### Database

**`PostgreSQL`** (via Supabase) — Primary relational database holding all vault data, client profiles, document records, and action logs. Relational model is the correct choice because vault data has real relationships — clients belong to advisors, documents belong to clients, actions belong to documents.

**`Prisma`** — TypeScript-first ORM for PostgreSQL. Auto-generates types from the schema so the database and application code stay in sync. Provides the data access layer for all vault reads and writes.

**`Supabase`** — Hosted PostgreSQL with built-in real-time subscription capabilities. The real-time layer powers live dashboard updates — when an agent logs an action, the dashboard reflects it instantly without polling. Eliminates the need to run a separate Redis instance for the demo.

### Job Scheduling

**`BullMQ`** — Redis-backed job queue for managing scheduled agent runs, follow-up timing, and the time-compressed simulation engine. Critical for the compliance agent which needs to check vaults on a schedule and re-check clients at defined intervals (e.g., "if no response in 5 days, run again"). BullMQ handles job persistence, retries on failure, and delayed execution reliably.

**`Redis`** — Backing store for BullMQ. The Cerebro codebase uses **`REDIS_URL`** (default `redis://localhost:6379`); **local Docker** is the standard development setup. Production may use any Redis-compatible host (including managed/serverless providers) without code changes beyond the URL.

### Notifications

**`Resend`** — Modern email API for sending mock advisor alerts, client document requests, and escalation notifications. Used to demonstrate the full loop end-to-end during the demo — the compliance officer actually receives an escalation email.

### Testing

**`Vitest`** — Fast TypeScript-native test runner. Used for unit tests on tool logic and integration tests on agent decision-making. Integrates with `@mastra/evals` for running evaluation suites in CI.

### Deployment

**`Vercel`** — Zero-config deployment for the Next.js application. Public URL available in minutes for sharing with FutureVault before the demo. Handles serverless function execution for agent API routes.

### Stack Summary

| Layer | Technology | Purpose |
|---|---|---|
| Agent Framework | Mastra (free, Apache 2.0) | Agent definition, tool calling, memory, workflows, evals |
| AI Model Gateway | OpenRouter via `@openrouter/ai-sdk-provider` | Flexible, cost-optimized routing to 300+ models |
| Frontend | Next.js 15 + Tailwind + shadcn/ui | Dashboard UI |
| Charts | Recharts | Simulation and testing visualization |
| Language | TypeScript | Full-stack type safety |
| Validation | Zod | Schema enforcement throughout |
| Database | PostgreSQL via Prisma on Supabase | Vault data, documents, action logs |
| Real-time | Supabase Realtime + Webhooks | Live dashboard updates + event-driven agent triggers |
| Job Queue | BullMQ + Redis (`REDIS_URL`) | Agent scheduling, event-driven triggers, follow-ups |
| Email | Resend | Mock notifications |
| Testing | Vitest + `@mastra/evals` | Agent quality measurement |
| Deployment | Vercel | Public demo URL |

---

## 4. Build Steps

---

### Step 1 — Mock Data

**Objective:** Create a realistic, comprehensive dataset that covers every scenario both agents will encounter, so the demo is never blocked by missing data.

#### What We Build

**Firm Hierarchy**
Two mock firms with a total of three advisors, reflecting a realistic multi-advisor firm structure. Each advisor owns a book of clients. One compliance officer sits above both advisors.

**Client Profiles — 15 Clients**

| ID | Name | Scenario | Primary Use |
|---|---|---|---|
| CLT-001 | Alex Chen | New client, day 1, no documents | Onboarding agent — start state |
| CLT-002 | Sarah Mitchell | Active client, one doc expiring in 45 days | Compliance — early warning |
| CLT-003 | Robert Park | KYC expired 60 days ago, advisor ignored stage 1-3 | Compliance — full escalation |
| CLT-004 | Emma Davis | Onboarding stuck at stage 2 for 12 days | Onboarding — stuck escalation |
| CLT-005 | Michael Torres | Fully compliant, all docs current | Baseline — agent monitoring quietly |
| CLT-006 | Jennifer Walsh | Missing AML verification, never had one | Compliance — missing doc |
| CLT-007 | David Kim | Multiple docs expiring within 14 days simultaneously | Compliance — multi-issue |
| CLT-008 | Lisa Patel | Government ID expired 90 days ago | Compliance — hard expired |
| CLT-009 | James Robinson | Onboarding 80% complete, one doc pending 7 days | Onboarding — near complete |
| CLT-010 | Amanda Foster | New corporate account, more complex doc set | Onboarding — account type variant |
| CLT-011 | Chris Nguyen | Stage 4 escalation — 30 days unresolved | Compliance — management level |
| CLT-012 | Rachel Simmons | Just responded to document request, stage advancing | Onboarding — progress state |
| CLT-013 | Thomas Hughes | Risk questionnaire outdated, IPS needs renewal | Compliance — suitability docs |
| CLT-014 | Nicole Bennett | Beneficiary never designated | Compliance — low urgency |
| CLT-015 | Mark Stevenson | Fully onboarded last week | Onboarding — completed state |

**Document Records**
Every client has a complete set of document records — including both present and intentionally absent documents. Each record carries:
- Document type and regulatory category
- Current status: `valid`, `expiring_soon`, `expired`, `missing`, `pending_review`, `requested`
- Upload date, expiry date, and days until expiry (computed)
- Whether the client has been notified and how many times
- The date of the last notification

**Action Log Pre-Population**
Clients CLT-003, CLT-007, and CLT-011 have pre-populated action logs showing the agent already having progressed through earlier escalation stages. This makes the demo feel like a running production system, not a fresh install.

#### Best Practice Notes

- All dates are computed relative to a configurable `DEMO_DATE` constant so the data never goes stale and the demo can be run at any time
- Client scenarios are designed with no overlap in the primary issue being demonstrated — each tells a distinct story
- The data seed script must be idempotent — running it twice produces the same result

---

### Step 2 — Vault System Replication

**Objective:** Build the data layer and access control system that replicates FutureVault's core vault model, ensuring agents can only ever access the vault they are scoped to.

#### Database Schema

**Five core tables:**

```
firms          → id, name, compliance_officer_id, created_at
advisors       → id, firm_id, name, email, created_at  
clients        → id, advisor_id, firm_id, name, email, account_type, 
                 onboarding_status, onboarding_stage, created_at
documents      → id, client_id, type, category, status, uploaded_at,
                 expiry_date, notification_count, last_notified_at, file_ref
agent_actions  → id, client_id, document_id, agent_type, action_type,
                 reasoning, performed_at, next_scheduled_at, outcome
```

#### Vault Access Control

This is the most important architectural decision in the entire system. Agents must be scoped to a specific vault — they cannot reach across to another client's data.

Each agent run is initialized with a `vaultContext` object that contains a scoped Prisma client restricted to a single `client_id`. All tool functions within that agent run receive this context and can only query or mutate records where `client_id` matches. There is no global database access available to tools — they receive only what the vault context exposes.

This mirrors how FutureVault would actually implement agent access in production — the agent is handed the keys to one vault at a time.

#### Vault Service Layer

A `VaultService` class provides the interface between tools and the database. It exposes typed methods only — `getClientProfile()`, `getDocumentsByStatus()`, `getActionHistory()`, `updateDocumentStatus()`, `logAction()`. Raw database queries are never exposed to agent tools directly.

This service layer also enforces a read/write boundary — the agent's observation tools only call read methods, and action tools only call write methods. This prevents accidental data corruption during the reasoning loop.

#### Event-Driven Document Upload Triggers

This is one of the most important architectural pieces in the entire system. When a document is uploaded to a vault, the agents should not have to wait for the next scheduled scan to react — they respond immediately.

The trigger architecture works as follows: when a document record is inserted or its status changes in the `documents` table, a Supabase database webhook fires. This webhook calls a Next.js API route which enqueues a priority BullMQ job for the affected client. BullMQ processes it ahead of the scheduled scan queue. The relevant agent runs against that client's vault within seconds of the upload.

This event-driven path handles two critical scenarios:
- **Document received during onboarding** — client uploads their government ID → onboarding agent fires immediately → validates the document → advances to stage 2 → sends next stage request. The client experiences this as instant, responsive automation rather than a system that checks in once a day.
- **Document uploaded that resolves a compliance issue** — client uploads an overdue KYC form → compliance agent fires immediately → confirms the issue is resolved → closes the escalation → logs the resolution. The compliance officer sees it resolved in real time.

The document upload event payload carries: `clientId`, `documentId`, `documentType`, `uploadedBy`, and `timestamp`. This is all the agent needs to know which vault to scope to and which document to evaluate first.

#### API Routes

Next.js API routes expose the vault data to the dashboard frontend:
- `GET /api/vaults` — list all client vaults with summary status
- `GET /api/vaults/[clientId]` — full vault detail for one client
- `GET /api/vaults/[clientId]/documents` — document list for one vault
- `GET /api/vaults/[clientId]/actions` — action log for one vault

#### Best Practice Notes

- The scoped vault context pattern means even a bug in agent logic cannot accidentally touch another client's data
- All database writes go through the service layer which validates input against Zod schemas before writing
- Action logs are append-only — records are never updated, only new records are inserted

---

### Step 3 — Agent Core

**Objective:** Build both agents as Mastra `Agent` instances with the correct system prompts, memory configuration, and model settings to make reliable, contextually appropriate decisions.

#### Mastra Instance

A single `Mastra` instance is configured with both agents registered, a shared PostgreSQL storage provider for memory persistence, and observability tracing enabled. Both agents draw from shared infrastructure while maintaining isolated memory threads per client.

#### Memory Architecture

Each client gets a dedicated memory thread identified by `clientId`. When an agent runs against a client's vault, it opens that thread and receives the full history of previous actions taken for that client. This is what gives the agent its awareness — it knows it already sent a reminder three days ago and will not send another until the correct interval has passed.

Working memory is configured with a structured Zod schema capturing:
- Current escalation stage for this client
- Last action type and date
- Number of notifications sent per document
- Whether the client has been marked as unresponsive

Mastra's vNext working memory is used, which supports targeted field updates rather than full rewrites — preventing accidental memory erasure during long agent runs.

#### Compliance Agent Definition

```
Name: Cerebro Compliance Agent
Model: Configurable via OpenRouter (default: google/gemini-2.0-flash)
Memory: PostgreSQL-backed, resource-scoped per client
Max Steps: 10 per run
Triggers: Scheduled (every 6 hours) + Event-driven (on document upload)
Stop Condition: When all documents have been assessed and all necessary actions taken
```

**System Prompt Core Principles:**
- The agent is a compliance specialist for a regulated financial firm
- It must always check action history before taking any action to avoid duplicates
- It must follow the escalation ladder strictly — no skipping stages
- It must reason about regulatory severity — not all missing documents are equal urgency
- It must always log its reasoning, not just its action
- It must never fabricate document data — it only works with what the vault contains

**Escalation Ladder Logic:**
1. Document issue detected → Notify assigned advisor
2. 5 days, no advisor action → Send direct reminder to client
3. 10 days, no client response → Second client reminder + second advisor nudge
4. 20 days, no resolution → Escalate to compliance officer with full case summary
5. 30 days, unresolved → Flag for firm management review

#### Onboarding Agent Definition

```
Name: Cerebro Onboarding Agent
Model: Configurable via OpenRouter (default: google/gemini-2.0-flash)
Memory: PostgreSQL-backed, resource-scoped per client
Max Steps: 15 per run (more steps due to stage advancement logic)
Triggers: Scheduled (every 12 hours) + Event-driven (on document upload)
Stop Condition: Client fully onboarded or escalated to advisor
```

**System Prompt Core Principles:**
- The agent manages the document collection journey for a new client
- It knows which documents are required at each of the four onboarding stages
- It sends warm, professional document request messages — not robotic reminders
- It validates that received documents match what was requested before advancing a stage
- It never advances a stage with incomplete documents
- It escalates to the advisor if a client has not responded within 7 days per stage

**Stage Definitions:**
- Stage 1: Identity verification — Government ID, Proof of Address, SIN/SSN
- Stage 2: Account setup — Account Application, Risk Questionnaire, Client Agreement
- Stage 3: Estate and compliance — Beneficiary Designation, Fee Disclosure
- Stage 4: Funding — Banking Information, Initial Deposit Confirmation

#### Agent Orchestration

A BullMQ worker process manages all agent runs across two trigger types:

**Scheduled Triggers (Polling)**
- Compliance Agent: Full scan of all active client vaults every 6 hours
- Onboarding Agent: Full check of all in-progress onboardings every 12 hours
- Both agents can also be triggered immediately via the dashboard for demo purposes

**Event-Driven Triggers (Real-Time)**
- Document uploaded to any vault → Priority BullMQ job fires for affected client
- Compliance Agent runs immediately if the client has any open compliance issues
- Onboarding Agent runs immediately if the client is in an active onboarding
- Event-triggered runs are queued at higher priority than scheduled scan runs — they execute within seconds of the upload

**Two-Queue Architecture**
BullMQ maintains two separate queues: a `priority-queue` for event-driven triggers and a `scheduled-queue` for periodic scans. This ensures a document upload during a large scheduled scan is never blocked waiting for 10,000 other clients to be processed first.

When an agent run completes, it emits a completion event to Supabase Realtime which the dashboard subscribes to for live updates.

#### Best Practice Notes

- Agents are completely stateless in code — all state lives in PostgreSQL memory
- Each agent run is idempotent by design — running it twice produces the same result because the memory check prevents duplicate actions
- Agent runs are wrapped in try/catch with automatic BullMQ retry on failure
- Max steps limit prevents runaway loops on edge case inputs

---

### Step 4 — Tool System

**Objective:** Build the complete set of typed tools both agents use to observe vault state and execute actions, with strict Zod schema validation on all inputs and outputs.

#### Tool Design Principles

- Every tool has a single, clearly defined responsibility
- Observation tools are read-only — they never write to the database
- Action tools always write to the action log as part of their execution
- Every tool validates its input with Zod before doing anything
- Tools return structured objects, never raw strings — agents can reliably parse the results

#### Shared Tools (Both Agents)

**`getClientProfile`**
Returns the complete client profile including account type, advisor, firm, and onboarding status. The foundation call every agent run starts with.

**`getActionHistory`**
Returns the full action log for this client, ordered by most recent first. The agent checks this before taking any action to avoid duplication.

**`logAction`**
Appends an action record to the audit trail with the agent's reasoning, the action type, the affected document, and the scheduled next check-in date.

**`sendAdvisorAlert`**
Sends a Resend email to the assigned advisor. Accepts a structured payload including client name, issue summary, and recommended action. Logs the send event.

#### Compliance Agent Tools

**`getDocumentComplianceStatus`**
Returns all documents for this client with their current status, expiry date, days until expiry, and notification history. The core observation tool for the compliance agent.

**`sendClientReminder`**
Sends a Resend email to the client requesting specific documents or notifying of an upcoming expiry. Accepts document type, urgency level, and a personalized message generated by the agent.

**`escalateToComplianceOfficer`**
Sends an escalation package to the firm's compliance officer. Includes the full case history, a timeline of all previous actions, and the agent's assessment of regulatory risk. Marks the client as escalated in the vault.

**`escalateToManagement`**
Final escalation stage. Sends a management-level alert with full case documentation. This tool can only be called if stage 4 is already complete in the action history — enforced by the tool's own validation logic.

**`updateDocumentStatus`**
Updates a document's status in the vault. Used to mark documents as `requested`, `received`, or `under_review` based on events.

#### Onboarding Agent Tools

**`getOnboardingStatus`**
Returns the current onboarding stage, the list of required documents for that stage, which are received, which are pending, and how many days the client has been at this stage.

**`requestDocument`**
Sends a document request email to the client via Resend. Accepts the specific document type, a plain-English explanation of why it is needed, and upload instructions. Updates the document status to `requested`.

**`validateDocumentReceived`**
Marks a document as received and valid after submission. Checks that the document type matches what was requested. If validation passes, updates the document status and logs the completion.

**`advanceOnboardingStage`**
Checks that all required documents for the current stage are in `valid` status, then increments the client's onboarding stage. Sends a congratulatory progress message to the client. This tool enforces its own pre-conditions and will refuse to advance if any document is incomplete.

**`completeOnboarding`**
Marks the client as fully onboarded when all four stages are complete. Sends a welcome completion message to the client and notifies the advisor. Updates firm-level metrics.

**`alertAdvisorStuck`**
Notifies the assigned advisor that a client has been stuck at a stage beyond the acceptable threshold. Includes days stuck, missing documents, and suggested advisor actions.

#### Best Practice Notes

- Each tool is defined as a Mastra `createTool()` call with an explicit `inputSchema` and `outputSchema` — Claude cannot hallucinate invalid parameters
- Escalation tools check prerequisites in their own logic — the agent cannot skip stages even if it tries
- All tools that send external communications (email) are wrapped in a dry-run mode for testing that logs the intended action without actually sending

---

### Step 5 — Operations Dashboard

**Objective:** Build the primary visual interface that shows both agents working in real time across all client vaults — the main screen for the live demo.

#### Dashboard Structure

**Firm Overview Panel**
The top-level view showing the whole firm at a glance:
- Total active clients and total vaults monitored
- Firm-wide compliance score (percentage of vaults with no outstanding issues)
- Active agent runs in progress
- Open escalation count by severity

**Client Vault Grid**
A filterable, sortable table of all client vaults. Each row shows:
- Client name and assigned advisor
- Vault health indicator (green / yellow / red)
- Number of documents with issues
- Current escalation stage if any
- Last agent action and when it occurred
- Click-through to the individual vault view

**Individual Vault View**
Drilling into a client shows:
- Full document status table with expiry dates and days remaining
- Complete agent action timeline with reasoning visible
- Current escalation stage and next scheduled action
- All documents requested and their response status

**Live Agent Activity Feed**
A real-time stream in the sidebar showing agent actions as they happen across all vaults. Powered by Supabase Realtime. Shows entries like:
- ✅ Compliance Agent — Sent advisor alert → Robert Park (KYC expired) [scheduled scan]
- ⚡ Onboarding Agent — Document received → Alex Chen uploaded Government ID [event-triggered]
- ⏳ Onboarding Agent — Advanced to Stage 2 → Alex Chen [event-triggered]
- 🚨 Compliance Agent — Escalated to compliance officer → Chris Nguyen [scheduled scan]

Event-triggered actions are marked with ⚡ to visually distinguish the real-time responsiveness from scheduled scan activity.

**Escalation Queue**
A dedicated panel showing all clients currently in escalation with their stage, days unresolved, and the compliance officer or manager assigned. One-click access to the full case file.

**Agent Controls**
Buttons to manually trigger a full compliance scan or force-check a specific client. Used during the demo to show the agent running live.

#### Real-time Architecture

Supabase Realtime subscriptions listen to the `agent_actions` table. Every time a new action is logged, the dashboard receives the event and updates the activity feed and affected vault row without a page refresh.

#### Best Practice Notes

- The dashboard is read-only — no mutations can be made from the UI except triggering agent runs
- All data is server-side rendered on first load for instant display, then hydrated with real-time updates
- The firm-wide compliance score is computed at the database level, not in JavaScript, to ensure consistency

---

### Step 6 — Testing System

**Objective:** Build a comprehensive, automated testing suite that verifies agent decision quality, tool correctness, and end-to-end scenario outcomes using Mastra's built-in eval framework and Vitest.

#### Three Layers of Testing

**Layer 1: Tool Unit Tests (Vitest)**

Every tool is tested in isolation with mock vault contexts. Tests verify:
- Correct input validation — tools reject malformed inputs
- Correct database writes — action logs are written with proper structure
- Correct prerequisite enforcement — escalation tools reject calls when preconditions are not met
- Dry-run mode produces identical output to real mode except no external call is made

**Layer 2: Agent Decision Evals (Mastra Evals + Vitest)**

For every defined client scenario, a ground truth expected decision is defined. Mastra's `runEvals()` function runs the agent against each scenario and a custom scorer evaluates whether the agent's decision matches the ground truth.

Custom scorers built for this system:
- **`escalationStageScorer`** — Did the agent choose the correct escalation stage given the action history?
- **`duplicateActionScorer`** — Did the agent avoid taking an action it already took recently?
- **`documentPriorityScorer`** — Did the agent correctly prioritize the most urgent document issue when multiple exist?
- **`onboardingStageScorer`** — Did the onboarding agent correctly identify the blocking document for the current stage?
- **`reasoningQualityScorer`** — Is the agent's logged reasoning specific, accurate, and regulatory-aware? (LLM-as-judge)

Each scorer returns a score between 0 and 1. The target threshold for all scorers is 0.85 or higher before the system is considered demo-ready.

**Layer 3: End-to-End Scenario Tests**

Full workflow tests that run a complete scenario from start to finish — simulating time passing, client responses, advisor actions, and measuring whether the agent reaches the correct outcome state.

Scenarios tested end-to-end:
- New client onboards successfully in under 21 simulated days
- Lapsed client escalates correctly through all five stages in 30 simulated days
- Expiring document is detected and resolved before it expires
- Agent handles a client who responds mid-escalation and correctly resets the escalation state
- Agent handles simultaneous issues on one client and correctly prioritizes

#### Eval Run Output

Each test run produces:
- Per-scorer results with scores and failure reasons
- Overall pass/fail per scenario
- Regression comparison against the previous run
- A summary showing total score across all scenarios (target: 85%+ overall)

#### Best Practice Notes

- Ground truth decisions are defined by a domain expert (compliance specialist knowledge) not by the AI itself
- Evals run in CI on every code change — a PR cannot merge if overall eval score drops below 80%
- The `reasoningQualityScorer` uses a cheaper model (Haiku) as the judge to keep eval costs low
- Dry-run mode on all tools means evals never send real emails or modify production-like data

---

### Step 7 — Testing Dashboard

**Objective:** Build a visual interface for viewing eval results, tracking agent quality over time, and debugging individual test failures.

#### Dashboard Structure

**Eval Overview**
- Overall agent quality score with trend line across the last 10 runs
- Per-scorer breakdown with score history
- Pass/fail counts per scenario category
- Last run timestamp and commit reference

**Scenario Deep-Dive**
For each defined test scenario:
- Expected outcome vs. actual outcome
- Tools called by the agent in sequence
- Agent's reasoning for each tool call
- Scorer results with explanations
- Side-by-side view when the scenario fails

**Regression Tracker**
A line chart showing overall score, escalation stage accuracy, and duplicate action rate across the last 30 eval runs. Makes regressions from prompt changes visually obvious.

**Failure Inspector**
A filterable list of all failed eval cases from the most recent run. Each failure shows the full agent trace — what context it received, what it decided, why the scorer marked it incorrect. This is the primary debugging tool.

**Scenario Matrix**
A heat map showing all 15 scenarios × all 5 scorers. Each cell is colored by score. The full picture at a glance — which scenarios are strong and which need work.

#### Best Practice Notes

- The testing dashboard is a separate Next.js route from the operations dashboard — `/testing` vs `/dashboard`
- Eval results are stored in the same PostgreSQL database as vault data so they persist across deployments
- The dashboard links each eval run to the git commit that produced it — making regression source identification trivial

---

### Step 8 — Simulation Engine

**Objective:** Build a time-compression engine that can generate thousands of synthetic client scenarios, run both agents across them in compressed time, and capture the full outcome metrics needed to prove enterprise scale effectiveness.

#### Simulation Architecture

**Synthetic Client Generator**
Generates `N` synthetic client records with randomized but realistic document states drawn from a defined probability distribution. The distribution is calibrated against real-world wealth management compliance data:
- 15% of clients have at least one expired document at any given time
- 30% of clients have at least one document expiring within 90 days
- 8% of clients have a missing required document
- 5% of new client onboardings stall at stage 2 or later

**Time Compression Engine**
Rather than waiting for real time to pass, the simulation advances a virtual clock in configurable increments. Each tick:
1. Updates document expiry states based on elapsed virtual time
2. Triggers scheduled agent runs
3. Simulates client document upload events (based on response probability)
4. Fires event-driven agent triggers for any uploads that occurred in this tick
5. Simulates advisor response behavior (configurable response rate)
6. Logs all outcomes

The event-driven path is simulated realistically — when a simulated client "uploads" a document, the agent responds to that event in the same tick rather than waiting for the next scheduled scan. This captures the full value of the real-time trigger architecture in the simulation metrics.

Client response behavior is stochastic — each simulated client has a response probability per reminder that models realistic human behavior. Unresponsive clients have lower probability. This produces a realistic distribution of escalation outcomes.

**Scale Parameters**
The simulation engine accepts:
- `clientCount`: 100 to 10,000
- `simulatedDays`: 30 to 365
- `clientResponseRate`: 0.0 to 1.0
- `advisorResponseRate`: 0.0 to 1.0
- `randomSeed`: for reproducible runs

**Execution Model**
For scale runs of 1,000+ clients, the simulation runs agents in batches of 50 using Node.js worker threads. This parallelizes execution while staying within rate limits. A 10,000 client / 90-day simulation completes in approximately 15-20 minutes.

#### Metrics Captured Per Run

| Metric | Definition |
|---|---|
| Issues Detected | Total document compliance issues found |
| Issues Resolved Autonomously | Resolved without human escalation |
| Autonomous Resolution Rate | Issues resolved / issues detected |
| Average Time to Resolution | Mean days from detection to resolution |
| Event-Triggered Resolutions | Issues resolved via upload event vs. scheduled scan |
| Avg. Response Latency (Event) | Mean time from document upload to agent response |
| Escalation Rate | % of issues requiring human intervention |
| Escalation Stage Distribution | % reaching each of the 5 stages |
| False Positive Rate | % of alerts on documents that were actually compliant |
| Onboarding Completion Rate | % of new clients fully onboarded |
| Average Onboarding Duration | Mean days to complete onboarding |
| Advisor Hours Saved (est.) | Issues resolved autonomously × avg. advisor time per issue |

#### A/B Comparison Output

Every simulation run produces a side-by-side comparison of:
- World A: Agents disabled, manual process only
- World B: Agents enabled

World A outcomes are calculated deterministically based on historical industry data for manual compliance processes. This produces the ROI numbers for the demo.

#### Best Practice Notes

- The simulation engine runs in a separate process from the Next.js application — it is triggered via a BullMQ job
- Random seeds are stored with every simulation run so results are exactly reproducible
- Agent tools run in dry-run mode during simulation — no emails are sent
- All simulation results are persisted to the database with the run parameters so they can be visualized and compared

---

### Step 9 — Simulation Visualization

**Objective:** Build a compelling visual presentation of simulation results that makes the enterprise scale story immediately obvious to executives watching the demo.

#### Visualization Panels

**Run Configuration Panel**
Input controls for simulation parameters — client count, days, response rates, random seed. A "Run Simulation" button triggers the BullMQ job. A progress indicator shows completion percentage as the simulation runs.

**Real-time Progress Feed**
As the simulation runs, a live feed shows batches completing — "Processed clients 1-50 of 10,000. Issues detected: 847. Resolved: 712." This makes the scale feel real during the demo.

**Outcome Summary Cards**
Large-format metric cards showing the headline numbers after a run completes:
- Autonomous Resolution Rate (target: 80%+)
- Average Time to Resolution
- Estimated Advisor Hours Saved
- Escalations Avoided

**Timeline Chart**
A time-series area chart showing the cumulative count of issues detected, issues resolved, and active escalations over the simulated period. Shows how the agent maintains a consistently low backlog even as new issues emerge.

**Escalation Funnel**
A funnel chart showing what percentage of issues were resolved at each escalation stage. The ideal shape is a steep funnel — most issues resolved at stage 1 or 2, very few reaching stage 4 or 5.

**A/B Comparison Chart**
Side-by-side bar charts showing:
- Expired documents at end of period: Manual vs. Agent
- Average days to resolve: Manual vs. Agent
- Escalations reaching management: Manual vs. Agent
- Onboarding completion rate: Manual vs. Agent

**Distribution Charts**
Histograms showing the distribution of time-to-resolution and escalation stage reached. Demonstrates that the agent performs consistently across all client types, not just on easy cases.

**Run Comparison Table**
A table showing results from the last 5 simulation runs with different parameters. Allows the demo to show that increasing client count does not degrade autonomous resolution rate — the agents scale linearly.

#### Best Practice Notes

- All charts are built with Recharts and update via Supabase Realtime as simulation batches complete
- The most impressive chart (A/B comparison) is featured prominently and shown first in the demo flow
- Simulation results persist — the demo can be paused and resumed without re-running the simulation

---

### Step 10 — Scale Testing Infrastructure

**Objective:** Build the infrastructure layer that makes genuine 10,000-client simulation possible within demo time constraints, with reliable execution, and reproducible results.

#### Execution Architecture

**Worker Process Design**
The scale simulation runs in a dedicated Node.js worker process separate from the Next.js application server. This prevents simulation load from affecting dashboard responsiveness. The worker is managed by BullMQ and can be horizontally scaled if needed.

**Batch Processing**
Clients are processed in batches of 50. Each batch is a BullMQ job. Batch jobs run concurrently up to a configurable parallelism limit (default: 10 concurrent batches = 500 clients at a time). Using a fast, cheap model via OpenRouter (e.g. Gemini Flash), a 10,000-client simulation completes in approximately 10-15 minutes. With the mock agent, the same run completes in under 5 minutes at zero API cost.

**Rate Limit Management**
The simulation uses a token bucket rate limiter in front of all LLM calls routed through OpenRouter. OpenRouter's rate limits vary by model — cheaper models have higher throughput limits, which is another reason to use them for simulation work. If a batch would exceed the rate limit, it is queued and delayed rather than erroring. This makes large simulations reliable rather than fragile.

**Agent Mocking for Ultra-Scale**
For simulations above 5,000 clients, a mock agent mode is available. Instead of calling any LLM for every decision, the mock agent uses a deterministic rule-based decision engine that replicates the most common agent behaviors. This allows 10,000+ client simulations to complete in under 5 minutes at zero API cost. Real LLM agent runs are used for accuracy validation at smaller scale; mock agent runs are used for scale demonstration.

The mock agent is validated against real agent runs to confirm >95% behavioral match before being used in demos.

**Progress Tracking**
A `simulation_runs` table in PostgreSQL tracks:
- Run ID and parameters
- Start time and estimated completion
- Batches completed vs. total
- Running metrics updated after each batch
- Final outcomes when complete

Supabase Realtime subscriptions on this table power the live progress feed in the simulation visualization dashboard.

**Result Storage**
Full simulation results are stored in PostgreSQL with the run ID as a foreign key. Results can be retrieved and re-visualized at any time without re-running the simulation. This means the demo can be prepared in advance and presented without live computation risk.

#### Load Testing

Before the demo, the infrastructure is validated with a benchmarking run:
- 10,000 synthetic clients
- 90 simulated days
- Mixed response rates
- Full metrics capture

This run establishes baseline numbers, validates that the infrastructure handles the load, and produces the charts used in the demo. The run is done with a fixed random seed so it is 100% reproducible during the live presentation.

#### Cost Management

LLM API calls through OpenRouter are the only real cost in this system. The strategy is to minimize these aggressively without compromising demo quality.

**Model tiering by task:**
- All development and iteration uses the cheapest capable model on OpenRouter (currently Gemini Flash or Haiku variants — often sub $0.001 per 1K tokens)
- Accuracy validation runs use a mid-tier model (Haiku or GPT-4o-mini)
- The live demo uses whichever model gives the best reasoning quality, swapped in via config
- The eval judge uses the cheapest model that can assess compliance reasoning reliably

**Simulation cost elimination:**
- Development: Mock agent exclusively — zero LLM calls
- Accuracy validation: 500 real agent runs to confirm mock fidelity
- Demo preparation: 1,000 real agent runs for primary demo numbers
- Scale visualization: 10,000 mock agent runs for scale charts — zero cost

**Estimated total API cost to build and demo this system: under $20** using the above strategy with OpenRouter's cheapest capable models. The mock agent handles all scale work; real LLM calls are reserved for the 15 live demo clients and the accuracy validation batch.

#### Best Practice Notes

- Every simulation run stores its random seed — the demo run can be re-created exactly if something goes wrong during the presentation
- The mock agent's deterministic logic is version-controlled and auditable — it is not a black box
- Infrastructure health metrics (batch completion rates, error rates, API rate limit headroom) are visible in a separate admin panel
- A "demo reset" script can restore the mock data to its initial state in under 30 seconds if a live demo run needs to be restarted

---

## Appendix: Definition of Done

The system is demo-ready when:

- [ ] All 15 mock clients have correct initial vault states
- [ ] Both agents produce correct decisions on all 15 scenarios
- [ ] Eval suite overall score is 85%+
- [ ] Real-time dashboard updates within 2 seconds of an agent action
- [ ] A 1,000-client simulation completes with 80%+ autonomous resolution rate
- [ ] A 10,000-client simulation visualization is preloaded and displayable
- [ ] The full demo flow can be delivered in 20 minutes without errors
- [ ] A public Vercel URL is live and accessible from any device
