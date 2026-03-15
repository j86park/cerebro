# STACK.md

## Tech Stack

| Package | Purpose | Why This One |
|---------|---------|--------------|
| **`@mastra/core`** | Agent Framework | Zero cost (Apache 2.0), TS-native, provides memory/workflows/tools built on AI SDK. |
| **`@mastra/evals`** | Evaluation Framework | Built-in test scaffolding for agent decision quality, model-graded scorers, CI integration. |
| **`@mastra/memory`** | Agent Memory | Persistent working memory + semantic recall so agents prevent duplicate requests. |
| **`@openrouter/ai-sdk-provider`**| AI Model Gateway | Unified gateway to 300+ models; eliminates lock-in, optimizes cost via model routing. |
| **Next.js 15 (App Router)** | Full-stack Framework | FutureVault runs Next.js; handles API routes + Server Components natively on Vercel. |
| **Tailwind CSS v4** | CSS Framework | Rapid utility-first UI building. |
| **shadcn/ui** | Component Library | Enterprise-grade accessible components (tables, dialogs, badges); consistent visual style. |
| **Recharts** | Data Visualization | Renders simulation charts, timelines, and testing dashboards. |
| **TypeScript** | Language | Strict typing for complex vault state, document metadata, and agent decisions. |
| **Zod** | Schema Validation | Enforces shape of every vault object, document, tool parameter, and agent decision. |
| **PostgreSQL (Supabase)** | Database | Relational model is correct for firm/advisor/client/doc relationships; Supabase provides realtime triggers. |
| **Prisma** | ORM | TS-first ORM; auto-generates types from schema. |
| **BullMQ** | Job Scheduling | Essential for delayed execution, event queues, and time-compressed simulation worker. |
| **Upstash Redis** | Queue Store | Serverless Redis backing for BullMQ; works on Vercel deployment. |
| **Resend** | Notifications | Modern email API for mock advisor alerts and client requests. |
| **Vitest** | Testing | Fast TS-native runner for unit tests and Mastra integrations. |
| **Vercel** | Deployment | Zero-config deployment for the Next.js application. |

## Cost Profile

| Service / Package | Free / Paid | Details |
|-------------------|-------------|---------|
| **Mastra Framework** | Free | 100% open source under the Apache 2.0 license. Zero cost. |
| **Vercel** | Free / Pro | Frontend hosting and zero-config deployment. Fits inside basic tiers. |
| **Supabase** | Free / Pro | Database and real-time sockets. Fits inside generous free tiers for demo traffic. |
| **Upstash Redis** | Free Tier | Pay-per-request model fits within free tier. |
| **Resend** | Free Tier | Free tier easily covers the demo volume of transactional emails. |
| **OpenRouter (LLM)** | Paid | Uses cheap tier (e.g. Gemini 2.0 Flash or Haiku). A 10,000-client real LLM simulation costs a few dollars. Using Mock Agent for ultra-scale cuts this to $0. Total API cost overall is estimated to be extremely low. |
