import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url().default("https://example.com/db"),
  UPSTASH_REDIS_URL: z.string().url().default("redis://localhost:6379"),
  UPSTASH_REDIS_TOKEN: z.string().optional(),
  SUPABASE_URL: z.string().url().default("https://example.supabase.co"),
  SUPABASE_ANON_KEY: z.string().default("dev-anon-key"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().default("https://example.supabase.co"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().default("dev-anon-key"),
  OPENROUTER_API_KEY: z.string().default("dev-openrouter-key"),
  RESEND_API_KEY: z.string().default("dev-resend-key"),
  DEMO_DATE: z.string().datetime().default(() => new Date().toISOString()),
  MODEL_DEV: z.string().default("google/gemini-flash-1.5"),
  MODEL_DEMO: z.string().default("anthropic/claude-3-haiku"),
  MODEL_EVAL_JUDGE: z.string().default("google/gemini-flash-1.5"),
  DRY_RUN: z.preprocess((value) => value === "true" || value === true, z.boolean()).default(true),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  WEBHOOK_SECRET: z.string().default("dev-webhook-secret"),
  SIM_TIME_SCALE: z.coerce.number().default(1),
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
