import { installUnitLaneModelBlock } from "./helpers/unit-lane-model";

/**
 * Default Vitest lane: fail closed if production OpenRouter `getModel` is hit.
 * Tests that need a model must `setModelOverride` with MockLanguageModel (or similar).
 * Live OpenRouter requires the `live-eval` project + `CI_LIVE_EVAL=1`.
 */
installUnitLaneModelBlock();
