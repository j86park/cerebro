import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";

/**
 * Postgres connection strings often fail `z.string().url()` (special characters in passwords,
 * `?sslmode=require`, etc.). Prisma validates the connection at runtime.
 */
const databaseUrlSchema = z
  .preprocess((val) => {
    if (val === undefined || val === null) return "";
    return String(val).trim();
  }, z.string())
  .transform((s) => (s === "" ? "https://example.com/db" : s))
  .pipe(
    z
      .string()
      .refine(
        (s) => /^postgres(ql)?:\/\/.+/i.test(s) || /^https?:\/\/.+/i.test(s),
        { message: "DATABASE_URL must be postgres://, postgresql://, or http(s)://" }
      )
  );

/**
 * True when the OpenRouter model id is pinned (not Auto Router).
 * REGULATORY / eval scores must stay comparable — `openrouter/auto` is banned for judges.
 */
export function isPinnedOpenRouterModelId(modelId: string): boolean {
  const id = modelId.trim().toLowerCase();
  if (id === "" || id === "openrouter/auto" || id === "auto") return false;
  if (id.endsWith("/auto")) return false;
  return true;
}

const envSchema = z.object({
  DATABASE_URL: databaseUrlSchema,
  /**
   * BullMQ / ioredis — local Docker is the supported setup (e.g. redis://localhost:6379).
   * Password, if any, belongs in the URL (redis://:secret@host:6379).
   */
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  SUPABASE_URL: z.string().url().default("https://example.supabase.co"),
  SUPABASE_ANON_KEY: z.string().default("dev-anon-key"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().default("https://example.supabase.co"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().default("dev-anon-key"),
  OPENROUTER_API_KEY: z.string().default("dev-openrouter-key"),
  RESEND_API_KEY: z.string().default("dev-resend-key"),
  DEMO_DATE: z.string().datetime().default(() => new Date().toISOString()),
  /** OpenRouter model ids — see https://openrouter.ai/models */
  MODEL_DEV: z.string().default("moonshotai/kimi-k2"),
  MODEL_DEMO: z.string().default("moonshotai/kimi-k2"),
  /**
   * Pinned eval-judge model id. Soft scorers must call `getModel("evalJudge")` only —
   * never hardcode this string outside this file. Ban `openrouter/auto` (judge drift).
   */
  MODEL_EVAL_JUDGE: z
    .string()
    .default("moonshotai/kimi-k2")
    .refine(isPinnedOpenRouterModelId, {
      message:
        "MODEL_EVAL_JUDGE must be a pinned OpenRouter model id (not openrouter/auto)",
    }),
  /**
   * Optional stronger judge for cascade Pilot (cheap-eval PR3).
   * When unset, cascade is disabled even if EVAL_JUDGE_CASCADE is true.
   * Still resolved only via `getEvalJudgeEscalateModel` / config — never hardcoded in scorers.
   */
  MODEL_EVAL_JUDGE_ESCALATE: z
    .string()
    .optional()
    .refine(
      (v) => v === undefined || v === "" || isPinnedOpenRouterModelId(v),
      {
        message:
          "MODEL_EVAL_JUDGE_ESCALATE must be a pinned OpenRouter model id (not openrouter/auto)",
      }
    ),
  /**
   * Pilot: escalate soft judge on `unknown` / `NEEDS_REVIEW` to MODEL_EVAL_JUDGE_ESCALATE.
   * Default false — opt-in only after calibration.
   */
  EVAL_JUDGE_CASCADE: z
    .preprocess(
      (value) => value === "true" || value === "1" || value === true,
      z.boolean()
    )
    .default(false),
  /**
   * Exact judge-result cache (in-process). Default true — repeated identical verdicts
   * skip OpenRouter. Semantic/fuzzy caches are intentionally unsupported.
   */
  EVAL_JUDGE_CACHE: z
    .preprocess(
      (value) =>
        value === undefined || value === null || value === ""
          ? true
          : value === "true" || value === "1" || value === true,
      z.boolean()
    )
    .default(true),
  /**
   * Optional USD budget gate for a live eval wave (null/0 = disabled).
   * When set, `assertEvalBudget` fails closed if recorded spend exceeds this.
   */
  EVAL_BUDGET_USD: z.coerce.number().min(0).default(0),
  DRY_RUN: z.preprocess((value) => value === "true" || value === true, z.boolean()).default(true),
  /**
   * Version id stamped on ActionLedger rows for stage × tool policy decisions.
   * Matrix defaults live in `src/lib/policy/`; this env value is the logged `policyVersion`.
   */
  TOOL_POLICY_VERSION: z.string().min(1).default("tool-policy-v1"),
  /**
   * Advisor HITL approval wait before timeout → SAFE_HOLD (never silent regulated auto-approve).
   * Milliseconds; defaults to 72h. Tests may set a small value.
   */
  HITL_APPROVAL_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(1000 * 60 * 60 * 24 * 30)
    .default(1000 * 60 * 60 * 72),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  WEBHOOK_SECRET: z.string().default("dev-webhook-secret"),
  SIM_TIME_SCALE: z.coerce.number().default(1),
  /** Optional CI commit for eval persistence */
  GITHUB_SHA: z.string().optional(),
  /** Supabase service role — required only for server-side Realtime broadcast */
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  /** Shared secret for `/api/cron/scheduled-scans` */
  CRON_SECRET: z.string().optional(),
  /**
   * Max connections for the shared `pg.Pool` used by all Mastra `@mastra/pg` stores.
   * Keep low on Supabase (pooler has a small per-user cap; Prisma uses a separate pool).
   */
  MASTRA_PG_POOL_MAX: z.coerce.number().int().min(1).max(30).default(5),
  /**
   * Self-correcting prompt pipeline: max gate rejections in a row before enqueue is blocked
   * (reset on promotion). Set 0 to disable the rejection cap (not recommended in prod).
   */
  MUTATION_MAX_CONSECUTIVE_REJECTIONS: z.coerce.number().int().min(0).max(100).default(3),
  /** Minimum minutes between mutation-analysis enqueues (0 = no cooldown). */
  MUTATION_COOLDOWN_MINUTES: z.coerce.number().int().min(0).max(10_080).default(5),
  /**
   * When rejection cap is hit, block new enqueues until this many hours pass (0 = block until DB reset).
   * REGULATORY: prevents runaway LLM spend while humans inspect prompts.
   */
  MUTATION_CIRCUIT_PAUSE_HOURS: z.coerce.number().int().min(0).max(8760).default(24),
  /**
   * When true, Mastra AI Tracing is enabled (DefaultExporter → configured storage).
   * OTLP/external exporters stay opt-in via OTEL_EXPORTER_OTLP_ENDPOINT (deferred until credentials exist).
   */
  MASTRA_TRACING_ENABLED: z
    .preprocess((value) => value === "true" || value === true, z.boolean())
    .default(true),
  /**
   * Opt-in capture of prompt/completion content on GenAI spans.
   * Default false — non-demo / production paths keep content redacted (hideInput/hideOutput).
   * Only honored when NODE_ENV is not "production".
   */
  TRACE_CONTENT_CAPTURE: z
    .preprocess((value) => value === "true" || value === true, z.boolean())
    .default(false),
  /**
   * Optional OTLP collector endpoint. When unset, exporters that need network credentials are skipped
   * (Postgres DecisionRecord remains the examiner system of record).
   */
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  /**
   * Canary `pass^k` trial count for mutation/shadow promote (τ-bench style).
   * All k trials must pass hard gates (incl. trajectory) before promote.
   */
  EVAL_PASS_K: z.coerce.number().int().min(3).max(5).default(3),
  /**
   * Document field extract adapter. Policy (Zod checklist / DEMO_DATE) stays in Cerebro.
   * `heuristic` / `llm-demo` for demo; `textract` / `persona` are stubs until credentials land.
   */
  DOCUMENT_EXTRACT_PROVIDER: z
    .enum(["heuristic", "llm-demo", "textract", "persona"])
    .default("heuristic"),
  /**
   * Uniform stream: fraction of completed agent jobs for async online judge (WP-P1.7 / PR5).
   * Cap 5%; 0 disables. Sampling never blocks the agent worker; DRY_RUN skips LLM calls.
   * Online sampling promotes goldens — it is never the ship gate.
   */
  ONLINE_JUDGE_SAMPLE_RATE: z.coerce.number().min(0).max(0.05).default(0.02),
  /**
   * Failure-weighted stream: fraction of *failure-signal* jobs to oversample into the
   * online → golden promote queue (cheap-eval PR5 dual-stream). Cap 1.0; default 0.25.
   * Independent of the uniform stream; still async + DRY_RUN-safe.
   */
  ONLINE_JUDGE_FAILURE_SAMPLE_RATE: z.coerce
    .number()
    .min(0)
    .max(1)
    .default(0.25),
  /**
   * Opt-in live OpenRouter eval Vitest lane (cheap-eval PR0 dual-lane).
   * Default false — unit/fixture CI must stay at $0 OpenRouter spend.
   */
  CI_LIVE_EVAL: z
    .preprocess(
      (value) => value === "true" || value === "1" || value === true,
      z.boolean()
    )
    .default(false),
  /**
   * Runtime Mastra `generate` step budget (tool-call turns).
   * REGULATORY / cost: caps wander; align with canary trajectory goldens (≤12).
   * Raise toward 16 only for multi-issue runs via env — never unbounded.
   */
  AGENT_MAX_STEPS: z.coerce.number().int().min(1).max(32).default(12),
  /**
   * Pilot: Mastra Observational Memory on Compliance/Onboarding threads.
   * Default false — T2.1 gate unmet (no proven long-thread / tool-as-subagent pressure).
   * Even when true, runtime still disables under DRY_RUN and NODE_ENV=test ($0 CI).
   * Never invents a third production agent; OM compresses existing agent threads only.
   */
  AGENT_OBSERVATIONAL_MEMORY: z
    .preprocess(
      (value) => value === "true" || value === "1" || value === true,
      z.boolean()
    )
    .default(false),
  /**
   * True when running under CI (GitHub Actions sets CI=true / GITHUB_ACTIONS=true).
   * Used to refuse accidental full×live suite runs (cheap-eval PR2).
   */
  CI: z
    .preprocess(
      (value) => value === "true" || value === "1" || value === true,
      z.boolean()
    )
    .default(false),
  /**
   * Explicit opt-in for `--suite full` under CI (nightly / pre-release jobs only).
   * Default false — PR CI must use canary or fixture unit lane.
   */
  EVAL_ALLOW_FULL_IN_CI: z
    .preprocess(
      (value) => value === "true" || value === "1" || value === true,
      z.boolean()
    )
    .default(false),
  /**
   * Opt-in live canary tool/prompt LOO (cheap-eval PR4 Pilot).
   * Default false — fixture LOO stays $0; live only when fixture ablation is inconclusive.
   */
  EVAL_LIVE_ABLATION: z
    .preprocess(
      (value) => value === "true" || value === "1" || value === true,
      z.boolean()
    )
    .default(false),
});

export const env = envSchema.parse(process.env);

const openrouter = createOpenRouter({
  apiKey: env.OPENROUTER_API_KEY,
});

const MODELS = {
  dev: env.MODEL_DEV,
  demo: env.MODEL_DEMO,
  evalJudge: env.MODEL_EVAL_JUDGE,
} as const;

export type ModelTier = keyof typeof MODELS;

/** Production OpenRouter chat model instance (or a test double via `setModelOverride`). */
export type ModelInstance = ReturnType<typeof openrouter.chat>;

type ModelFactory = (tier: ModelTier) => ModelInstance;

/**
 * Test-only model factory. When set, `getModel` never calls OpenRouter.
 * Production code must leave this unset.
 */
let modelFactoryOverride: ((tier: ModelTier) => unknown) | null = null;

/**
 * Injects a model factory for Vitest (MockLanguageModel / throw-guard).
 * Pass `null` to restore OpenRouter-backed resolution.
 */
export function setModelOverride(
  factory: ((tier: ModelTier) => unknown) | null
): void {
  modelFactoryOverride = factory;
}

/**
 * Returns whether a test model override is currently installed.
 */
export function hasModelOverride(): boolean {
  return modelFactoryOverride !== null;
}

/**
 * Returns the configured OpenRouter model id for a tier (no network).
 * Prefer this for EvalRun stamps — never hardcode model strings.
 */
export function getModelId(tier: ModelTier): string {
  return MODELS[tier];
}

/**
 * Optional escalate-tier model id for judge cascade Pilot, or null when unset.
 */
export function getEvalJudgeEscalateModelId(): string | null {
  const id = env.MODEL_EVAL_JUDGE_ESCALATE?.trim();
  if (!id) return null;
  return id;
}

/**
 * Returns true when cascade Pilot is enabled and an escalate model is configured.
 */
export function isEvalJudgeCascadeEnabled(): boolean {
  return env.EVAL_JUDGE_CASCADE && getEvalJudgeEscalateModelId() !== null;
}

/**
 * Builds a sticky OpenRouter `session_id` for a live eval wave (prefix caching).
 * PR/unit lanes must not call live OpenRouter — this is for budgeted live batches only.
 */
export function buildLiveEvalSessionId(waveId: string): string {
  const safe = waveId.trim().replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 96);
  return `cerebro-eval-${safe || "wave"}`;
}

/**
 * Returns the configured model by tier.
 * Uses `setModelOverride` when installed (unit/fixture tests); otherwise OpenRouter.
 */
export function getModel(tier: ModelTier = "dev") {
  if (modelFactoryOverride) {
    return modelFactoryOverride(tier) as ModelInstance;
  }
  return openrouter.chat(MODELS[tier]);
}

/**
 * Live-eval OpenRouter model with sticky `session_id` for provider prefix caching.
 * AUT stays on `dev`; judges use `evalJudge`. Never used by default unit CI.
 */
export function getModelWithLiveSession(
  tier: ModelTier,
  sessionId: string
): ModelInstance {
  if (modelFactoryOverride) {
    return modelFactoryOverride(tier) as ModelInstance;
  }
  const sid = buildLiveEvalSessionId(sessionId);
  return openrouter.chat(MODELS[tier], {
    extraBody: { session_id: sid },
  });
}

/**
 * Escalate-tier judge model for cascade Pilot, or null when disabled/unset.
 * Still config-only — never hardcode a model string in scorers.
 */
export function getEvalJudgeEscalateModel(
  sessionId?: string
): ModelInstance | null {
  const id = getEvalJudgeEscalateModelId();
  if (!id || !env.EVAL_JUDGE_CASCADE) return null;
  if (modelFactoryOverride) {
    // Test seam: treat escalate like evalJudge unless override inspects tier.
    return modelFactoryOverride("evalJudge") as ModelInstance;
  }
  if (sessionId) {
    const sid = buildLiveEvalSessionId(sessionId);
    return openrouter.chat(id, { extraBody: { session_id: sid } });
  }
  return openrouter.chat(id);
}

/**
 * Fails closed when recorded OpenRouter USD spend exceeds `EVAL_BUDGET_USD` (when > 0).
 */
export function assertEvalBudget(spendUsd: number): void {
  const cap = env.EVAL_BUDGET_USD;
  if (cap <= 0) return;
  if (spendUsd > cap) {
    throw new Error(
      `Eval OpenRouter spend $${spendUsd.toFixed(4)} exceeded EVAL_BUDGET_USD=$${cap}`
    );
  }
}

/**
 * Returns the Mastra `generate` maxSteps budget from config.
 * Optional override (e.g. trajectory golden) is clamped to `AGENT_MAX_STEPS`.
 */
export function getAgentMaxSteps(override?: number): number {
  const cap = env.AGENT_MAX_STEPS;
  if (override === undefined) return cap;
  if (!Number.isFinite(override) || override < 1) {
    throw new Error(`getAgentMaxSteps override must be a positive integer, got ${override}`);
  }
  return Math.min(Math.floor(override), cap);
}

/**
 * Returns whether Observational Memory may activate at runtime.
 * Requires AGENT_OBSERVATIONAL_MEMORY=true and fails closed under DRY_RUN / test
 * so default CI stays at $0 OpenRouter for Observer/Reflector calls.
 */
export function isObservationalMemoryEnabled(): boolean {
  if (!env.AGENT_OBSERVATIONAL_MEMORY) return false;
  if (env.DRY_RUN) return false;
  if (env.NODE_ENV === "test") return false;
  return true;
}
