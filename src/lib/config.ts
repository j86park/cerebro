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
  MODEL_EVAL_JUDGE: z.string().default("moonshotai/kimi-k2"),
  DRY_RUN: z.preprocess((value) => value === "true" || value === true, z.boolean()).default(true),
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

/**
 * Returns the configured OpenRouter model by tier.
 */
export function getModel(tier: ModelTier = "dev") {
  return openrouter(MODELS[tier]);
}
