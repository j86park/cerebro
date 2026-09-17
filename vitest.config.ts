import { config as loadEnv } from "dotenv";
import path from "node:path";
import { defineConfig } from "vitest/config";

// Match Next.js: `.env` then `.env.local` (override). Plain `dotenv/config` only loads `.env`, so tests
// were using a local `DATABASE_URL` from `.env` while dev used Supabase from `.env.local`.
loadEnv({ path: path.resolve(process.cwd(), ".env") });
loadEnv({ path: path.resolve(process.cwd(), ".env.local"), override: true });

const sharedResolve = {
  alias: {
    "@": path.resolve(__dirname, "src"),
  },
};

/**
 * Dual-lane Vitest (cheap-eval PR0):
 * - unit: fixtures + mocked LLM; OpenRouter getModel blocked ($0 default CI)
 * - live-eval: opt-in only via CI_LIVE_EVAL=1 (`npm run test:live-eval`)
 */
export default defineConfig({
  resolve: sharedResolve,
  test: {
    projects: [
      {
        resolve: sharedResolve,
        test: {
          name: "unit",
          include: ["tests/**/*.test.ts"],
          exclude: ["tests/**/*.live-eval.test.ts"],
          environment: "node",
          setupFiles: ["./tests/setup.ts", "./tests/setup.unit-lane.ts"],
        },
      },
      {
        resolve: sharedResolve,
        test: {
          name: "live-eval",
          include: ["tests/**/*.live-eval.test.ts"],
          environment: "node",
          setupFiles: ["./tests/setup.ts", "./tests/setup.live-eval-lane.ts"],
        },
      },
    ],
  },
});
