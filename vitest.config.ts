import { config as loadEnv } from "dotenv";
import path from "node:path";
import { defineConfig } from "vitest/config";

// Match Next.js: `.env` then `.env.local` (override). Plain `dotenv/config` only loads `.env`, so tests
// were using a local `DATABASE_URL` from `.env` while dev used Supabase from `.env.local`.
loadEnv({ path: path.resolve(process.cwd(), ".env") });
loadEnv({ path: path.resolve(process.cwd(), ".env.local"), override: true });

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
  },
});
