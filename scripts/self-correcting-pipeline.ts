/**
 * Self-correcting prompt pipeline — prep and optional eval trigger.
 *
 * Run from repo root (loads `.env.local`):
 *   node --env-file=.env.local --import tsx scripts/self-correcting-pipeline.ts [options]
 *
 * Or: npm run self-correcting:prep
 *
 * Options:
 *   --skip-migrate     Skip `prisma migrate deploy`
 *   --skip-seed        Skip `seed:prompts`
 *   --trigger-eval     POST to /api/testing/run (needs Next dev on --base-url)
 *   --base-url=URL     Default http://localhost:3000
 *   -h, --help         Show help
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function parseArgs(argv: string[]): {
  skipMigrate: boolean;
  skipSeed: boolean;
  triggerEval: boolean;
  baseUrl: string;
  help: boolean;
} {
  let skipMigrate = false;
  let skipSeed = false;
  let triggerEval = false;
  let baseUrl = "http://localhost:3000";
  let help = false;

  for (const a of argv) {
    if (a === "--skip-migrate") skipMigrate = true;
    else if (a === "--skip-seed") skipSeed = true;
    else if (a === "--trigger-eval") triggerEval = true;
    else if (a === "-h" || a === "--help") help = true;
    else if (a.startsWith("--base-url=")) {
      baseUrl = a.slice("--base-url=".length).replace(/\/$/, "");
    }
  }
  return { skipMigrate, skipSeed, triggerEval, baseUrl, help };
}

function printHelp(): void {
  console.log(`
Cerebro — self-correcting pipeline prep

Usage:
  node --env-file=.env.local --import tsx scripts/self-correcting-pipeline.ts [options]

Options:
  --skip-migrate   Skip database migrations
  --skip-seed      Skip PromptVersion seed (compliance + onboarding)
  --trigger-eval   POST /api/testing/run (requires \`npm run dev\` in another terminal)
  --base-url=URL   Base URL for --trigger-eval (default: http://localhost:3000)
  -h, --help       This message

Typical flow:
  1. This script (migrate + seed)
  2. Terminal A: npm run dev
  3. Terminal B: npx tsx scripts/start-workers.ts
  4. This script with --trigger-eval  OR  use Testing UI "Run Evaluation Suite"

Env: DATABASE_URL, REDIS_URL, optional MUTATION_* (see src/lib/config.ts)
`);
}

async function triggerEvalApi(baseUrl: string): Promise<void> {
  const url = `${baseUrl}/api/testing/run`;
  const maxAttempts = 8;
  const delayMs = 2000;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchSize: 3 }),
      });
      const text = await res.text();
      if (!res.ok) {
        console.error(`[trigger-eval] HTTP ${res.status}: ${text.slice(0, 500)}`);
        process.exit(1);
      }
      console.log("[trigger-eval] POST /api/testing/run OK");
      try {
        const json = JSON.parse(text) as { data?: unknown };
        if (json.data && typeof json.data === "object" && json.data !== null) {
          const d = json.data as { overallScore?: number; evalRunId?: string };
          console.log(
            `  overallScore=${d.overallScore ?? "?"} evalRunId=${d.evalRunId ?? "?"}`
          );
        }
      } catch {
        // non-JSON body is fine
      }
      return;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const retryable =
        msg.includes("fetch") ||
        msg.includes("ECONNREFUSED") ||
        msg.includes("ENOTFOUND");
      if (retryable && attempt < maxAttempts) {
        console.warn(
          `[trigger-eval] attempt ${attempt}/${maxAttempts} failed (${msg}). Is \`npm run dev\` running? Retrying in ${delayMs / 1000}s…`
        );
        await new Promise((r) => setTimeout(r, delayMs));
      } else {
        console.error("[trigger-eval] Failed:", e);
        process.exit(1);
      }
    }
  }
}

function requireEnvLocal(): void {
  const envLocal = path.join(root, ".env.local");
  if (!existsSync(envLocal)) {
    console.warn(
      "[warn] .env.local not found. Run with: node --env-file=.env.local --import tsx …\n" +
        "       or ensure DATABASE_URL / REDIS_URL are set in the environment."
    );
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const opts = parseArgs(argv);

  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  requireEnvLocal();

  console.log("=== Cerebro — self-correcting pipeline ===\n");

  if (!opts.skipMigrate) {
    console.log("[1/2] prisma migrate deploy …");
    // Inherits env from the parent process (run with `node --env-file=.env.local …`).
    execSync("npx prisma migrate deploy", {
      stdio: "inherit",
      cwd: root,
      env: process.env,
    });
    console.log("");
  } else {
    console.log("[1/2] skipped (--skip-migrate)\n");
  }

  if (!opts.skipSeed) {
    console.log("[2/2] seed:prompts …");
    execSync("npm run seed:prompts", { stdio: "inherit", cwd: root, env: process.env });
    console.log("");
  } else {
    console.log("[2/2] skipped (--skip-seed)\n");
  }

  console.log("--- Prep complete ---\n");
  console.log("Required env: DATABASE_URL, REDIS_URL (see .env.example)\n");
  console.log("Next steps (manual):\n");
  console.log("  • Terminal A:  npm run dev");
  console.log("  • Terminal B:  npx tsx scripts/start-workers.ts");
  console.log(
    "  • Trigger eval: open Testing page → Run Evaluation Suite, or re-run this script with --trigger-eval\n"
  );
  console.log("Watch: worker logs (mutation-analysis → shadow-run), Testing → Mutation history,");
  console.log("       GET /api/testing/mutations, table PromptMutationCircuitState (id=singleton).\n");
  console.log(
    "Optional CLI eval (persists EvalRun, may enqueue mutation): npm run eval (threshold) or npm run eval:dev (no threshold)\n"
  );

  if (opts.triggerEval) {
    console.log(`--- Triggering eval via ${opts.baseUrl} ---\n`);
    await triggerEvalApi(opts.baseUrl);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
