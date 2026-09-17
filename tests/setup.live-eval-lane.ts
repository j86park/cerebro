import { env } from "@/lib/config";

/**
 * Live-eval Vitest lane: refuse to run unless explicitly opted in.
 * Cheap-eval PR0: no OpenRouter calls in the smoke file; later PRs add capped live tests.
 */
if (!env.CI_LIVE_EVAL) {
  throw new Error(
    "live-eval Vitest project requires CI_LIVE_EVAL=1 (refusing to run to keep default CI at $0 OpenRouter)."
  );
}
