# SPEC.md — Project Specification

> **Status**: `FINALIZED`

## Vision
Cerebro is an autonomous AI agent layer built on top of a replicated FutureVault-style document vault system. It uses two specialized agents — a Compliance Agent and an Onboarding Agent — to continuously monitor client vaults, detect regulatory or workflow issues, and take escalating autonomous actions to resolve them without human intervention until genuinely necessary. It demonstrates that FutureVault's existing document infrastructure can be extended into a proactive intelligence layer for enterprise clients.

## Core Value Proposition
*Every other platform tells you something is wrong. Cerebro's agents fix it.*

## The Two Agents
- **Compliance Agent**: Monitors all existing client vaults continuously. Detects regulatory document issues (expired KYC forms, missing AML verification, outdated risk questionnaires) and autonomously escalates through a defined action ladder from advisor alert to compliance officer to firm management with full auditability.
- **Onboarding Agent**: Takes ownership of every new client from creation. Drives document collection through a staged pipeline, sends requests, follows up on non-responses, validates submitted documents, advances stages, and escalates to the advisor when a client is stuck.

## Demo Personas
1. **Alex Chen**: Brand new client, zero documents uploaded (Primary Agent: Onboarding Agent)
2. **Sarah Mitchell**: 5-year client, one document expiring in 45 days (Primary Agent: Compliance Agent - proactive mode)
3. **Robert Park**: Lapsed client, KYC expired, advisor unresponsive (Primary Agent: Compliance Agent - full escalation)

## Intended Audience
FutureVault and their enterprise wealth management clients (demonstrating how static vaults become active operational layers).

## Tech Stack at a Glance
- **Agent Framework**: `@mastra/core` (with `@mastra/evals`, `@mastra/memory`)
- **AI Model Gateway**: OpenRouter via `@openrouter/ai-sdk-provider`
- **Frontend / Fullstack**: Next.js 15 (App Router)
- **UI & Styling**: Tailwind CSS v4 + shadcn/ui + Recharts
- **Language**: TypeScript with Zod validation
- **Database**: PostgreSQL (via Supabase)
- **ORM**: Prisma
- **Job Scheduling**: BullMQ + Upstash Redis
- **Notifications**: Resend (Email API)
- **Testing**: Vitest + `@mastra/evals`
- **Deployment**: Vercel
