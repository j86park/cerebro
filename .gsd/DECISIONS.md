# DECISIONS.md

## ADR-1: Mastra Core Framework
**Decision:** Use `@mastra/core` as the primary agent framework.
**Reasoning:** 100% free and open source (Apache 2.0). Provides built-in workflow orchestration, memory, and tool loop management natively in TypeScript. Built on top of Vercel AI SDK.
**Alternatives rejected:** Vercel AI SDK (lacks orchestration and robust memory out of the box), LangChain (too heavy, poor TS ergonomics), raw API calls (requires manual tool loop and memory management).
**Consequences:** All agents, tools, memory, and evals must use Mastra primitives. 

## ADR-2: OpenRouter AI Model Gateway
**Decision:** Use `@openrouter/ai-sdk-provider` as the exclusive model gateway.
**Reasoning:** Eliminates vendor lock-in, allows cost-optimized routing to 300+ models via a single API key and billing account, future-proofing the system.
**Alternatives rejected:** Direct Anthropic or OpenAI API integrations.
**Consequences:** Models are specified by string configuration pointing to OpenRouter, using `getModel()`.

## ADR-3: VaultService Access Control Pattern
**Decision:** All database access must go exclusively through a client-scoped `VaultService`.
**Reasoning:** Ensures strict multi-tenant isolation. Agents can only interact with the vault they are scoped to, mirroring how FutureVault implements agent access in production.
**Alternatives rejected:** Tools importing `prisma` directly or taking `clientId` as an argument internally with a global client instance.
**Consequences:** `VaultService` is constructed once per run with a fixed `clientId`. Tools never import Prisma and read/write exclusively through their injected VaultService.

## ADR-4: Two-Queue BullMQ Architecture
**Decision:** Use separate `priority-queue` and `scheduled-queue` in BullMQ.
**Reasoning:** Ensures real-time responsiveness for document uploads (priority-queue) even if a large batched scan of 10,000 vaults is executing (scheduled-queue).
**Alternatives rejected:** Single unified queue or synchronous route handler execution.
**Consequences:** Workers must be configured to process the priority queue first. Webhooks route to the priority queue.

## ADR-5: DEMO_DATE Strategy
**Decision:** All date logic uses `env.DEMO_DATE` instead of `new Date()`.
**Reasoning:** Ensures mock data never goes stale and the demo can be run at any time without having to re-seed the database periodically.
**Alternatives rejected:** Using actual system time.
**Consequences:** Every expiry computation, action schedule, and seed script record must compute offsets relative to `env.DEMO_DATE`.

## ADR-6: Append-Only AgentAction Table
**Decision:** The `AgentAction` log table in the database is strictly append-only.
**Reasoning:** Maintains an immutable, fully auditable history of every agent observation and action for compliance and eval tracking.
**Alternatives rejected:** Updating existing action rows.
**Consequences:** Records are never updated or deleted (except during demo resets).

## ADR-7: Tool Factory Function Pattern
**Decision:** Tools are defined as factory functions (e.g., `buildTool(vault: VaultService)`) rather than direct exports.
**Reasoning:** Injects the scoped `VaultService` instance into the tool closure so the tool doesn't instantiate its own database connection.
**Alternatives rejected:** Exporting static tools or requiring `clientId` in the Zod input schema.
**Consequences:** Every tool file must export a builder function that returns a Mastra `createTool` definition.

## ADR-8: Mock Agent for Scale Simulation
**Decision:** Use a deterministic rule-based mock agent for ultra-scale testing (5,000+ clients).
**Reasoning:** Allows extreme scale tests to finish quickly (10,000 clients in ~5-15 mins) and cost nothing in API fees while maintaining ~95% behavioral fidelity to real LLM calls.
**Alternatives rejected:** Using LLM API calls for all simulation runs, which would rate-limit and cost significantly more.
**Consequences:** Requires validating the mock agent output against the real agent output via the `mockAgent.fidelity` test suite.

## ADR-9: Supabase Realtime over Polling
**Decision:** Use Supabase Realtime subscriptions to update the operations dashboard.
**Reasoning:** Push-based updates provide instant UI feedback when agents log actions or advance stages without overwhelming the database with polling traffic.
**Alternatives rejected:** Client-side polling loops or self-hosted Websocket servers.
**Consequences:** The dashboard relies entirely on PostgreSQL `INSERT/UPDATE` events streamed via Supabase channels, requiring strict cleanup on React component unmount.

## ADR-10: Single Mastra Instance
**Decision:** A single `Mastra` instance is instantiated in `src/agents/mastra.ts` and imported everywhere.
**Reasoning:** Centralizes agent registration, telemetry logging, and persistent memory storage configuration.
**Alternatives rejected:** Instantiating new Mastra engines dynamically on the fly per run.
**Consequences:** Route handlers and BullMQ workers strictly import the singleton `cerebro` object to fetch agents by name.
