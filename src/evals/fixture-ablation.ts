import { z } from "zod";
import {
  loadAllTrajectoryFixtures,
  type TrajectoryFixture,
} from "@/evals/fixtures";
import { GROUND_TRUTH } from "@/evals/ground-truth";
import { scoreTrajectory } from "@/evals/scorers/score-trajectory";
import type { TrajectoryGolden } from "@/evals/trajectory-golden";
import {
  assertEvalBudget,
  buildLiveEvalSessionId,
  env,
} from "@/lib/config";

/**
 * How to remove a tool from a frozen trajectory during fixture LOO.
 * - all_occurrences: drop every call of that tool (default FeasiGen-style mask)
 * - first_occurrence: drop only the first call (rare duplicate-call diagnostics)
 */
export const toolMaskModeSchema = z.enum([
  "all_occurrences",
  "first_occurrence",
]);

export type ToolMaskMode = z.infer<typeof toolMaskModeSchema>;

export const ablationArmKindSchema = z.enum([
  "tool_mask",
  "prompt_component",
]);

export type AblationArmKind = z.infer<typeof ablationArmKindSchema>;

/**
 * Named prompt clause for optional component LOO on fixtures.
 * Attributed tools are masked together when the component is left out.
 * REGULATORY: ablation wins never auto-promote into production prompts.
 */
export const promptComponentSchema = z.object({
  id: z.string().min(1),
  description: z.string().optional(),
  attributedTools: z.array(z.string().min(1)).min(1),
});

export type PromptComponent = z.infer<typeof promptComponentSchema>;

export const toolMaskArmResultSchema = z.object({
  kind: z.literal("tool_mask"),
  fixtureId: z.string().min(1),
  scenarioId: z.string().min(1),
  maskedTool: z.string().min(1),
  maskMode: toolMaskModeSchema,
  baselineScore: z.number().min(0).max(1),
  maskedScore: z.number().min(0).max(1),
  loadBearing: z.boolean(),
  baselineReason: z.string(),
  maskedReason: z.string(),
  maskedToolNames: z.array(z.string()),
});

export type ToolMaskArmResult = z.infer<typeof toolMaskArmResultSchema>;

export const promptComponentArmResultSchema = z.object({
  kind: z.literal("prompt_component"),
  fixtureId: z.string().min(1),
  scenarioId: z.string().min(1),
  componentId: z.string().min(1),
  maskedTools: z.array(z.string().min(1)),
  baselineScore: z.number().min(0).max(1),
  maskedScore: z.number().min(0).max(1),
  loadBearing: z.boolean(),
  baselineReason: z.string(),
  maskedReason: z.string(),
  maskedToolNames: z.array(z.string()),
});

export type PromptComponentArmResult = z.infer<
  typeof promptComponentArmResultSchema
>;

export const fixtureLooArmResultSchema = z.discriminatedUnion("kind", [
  toolMaskArmResultSchema,
  promptComponentArmResultSchema,
]);

export type FixtureLooArmResult = z.infer<typeof fixtureLooArmResultSchema>;

export const fixtureLooReportSchema = z.object({
  /** Always fixture path — OpenRouter spend must stay 0. */
  mode: z.literal("fixture"),
  openRouterSpendUsd: z.literal(0),
  fixtureCount: z.number().int().min(0),
  arms: z.array(fixtureLooArmResultSchema),
  loadBearingTools: z.array(z.string()),
  loadBearingComponents: z.array(z.string()),
  inconclusive: z.boolean(),
  inconclusiveReason: z.string().optional(),
});

export type FixtureLooReport = z.infer<typeof fixtureLooReportSchema>;

/**
 * Budgeted live LOO plan (Pilot). Does not call OpenRouter by itself —
 * callers must pass `assertLiveAblationAllowed` and run agents under DRY_RUN.
 */
export const liveLooBatchSchema = z.object({
  /** Stable toolset fingerprint for shared-prefix batching. */
  batchKey: z.string().min(1),
  maskedTool: z.string().nullable(),
  componentId: z.string().nullable(),
  clientIds: z.array(z.string().min(1)).min(1),
  sessionId: z.string().min(1),
});

export type LiveLooBatch = z.infer<typeof liveLooBatchSchema>;

export const liveLooPlanSchema = z.object({
  mode: z.literal("live_canary_planned"),
  reason: z.string().min(1),
  maxArms: z.number().int().positive(),
  budgetUsd: z.number().min(0),
  sessionWaveId: z.string().min(1),
  batches: z.array(liveLooBatchSchema),
});

export type LiveLooPlan = z.infer<typeof liveLooPlanSchema>;

/**
 * Removes a tool from an ordered trajectory (leave-one-out mask).
 */
export function maskToolFromTrajectory(
  toolNames: readonly string[],
  tool: string,
  mode: ToolMaskMode = "all_occurrences"
): string[] {
  const parsedMode = toolMaskModeSchema.parse(mode);
  if (parsedMode === "all_occurrences") {
    return toolNames.filter((t) => t !== tool);
  }
  let removed = false;
  return toolNames.filter((t) => {
    if (!removed && t === tool) {
      removed = true;
      return false;
    }
    return true;
  });
}

/**
 * Removes every attributed tool for a prompt component from a trajectory.
 */
export function maskPromptComponentFromTrajectory(
  toolNames: readonly string[],
  component: PromptComponent
): string[] {
  const parsed = promptComponentSchema.parse(component);
  const drop = new Set(parsed.attributedTools);
  return toolNames.filter((t) => !drop.has(t));
}

/**
 * Unique tools to ablate for a fixture. Prefers tools that appear in both
 * the frozen trajectory and the golden expected set / sequence when available;
 * otherwise every unique name in the trajectory.
 */
export function listToolMaskCandidates(
  toolNames: readonly string[],
  golden?: TrajectoryGolden | null
): string[] {
  const unique = [...new Set(toolNames)];
  if (!golden) return unique;

  const expected = new Set<string>([
    ...(golden.expectedTools ?? []),
    ...(golden.expectedToolSequence ?? []),
  ]);
  if (expected.size === 0) return unique;

  const inExpected = unique.filter((t) => expected.has(t));
  // Also include non-expected tools present in the fixture so helpers like
  // `logAction` can be reported as non-load-bearing.
  const extras = unique.filter((t) => !expected.has(t));
  return [...inExpected, ...extras];
}

/**
 * Resolves GROUND_TRUTH trajectory golden for a fixture scenario.
 */
export function resolveFixtureTrajectoryGolden(
  scenarioId: string
): TrajectoryGolden | null {
  const scenario = GROUND_TRUTH.find((g) => g.clientId === scenarioId);
  return scenario?.expected.trajectory ?? null;
}

/**
 * Default prompt components derived from a trajectory golden (optional LOO).
 * Soft / lesson-shaped groups only — never used to unsupervised-promote REGULATORY text.
 */
export function defaultPromptComponentsForGolden(
  golden: TrajectoryGolden
): PromptComponent[] {
  const components: PromptComponent[] = [];
  const observeToolIds = new Set([
    "getClientProfile",
    "getActionHistory",
    "getDocumentComplianceStatus",
    "getOnboardingStatus",
  ]);
  const observe = (golden.expectedTools ?? []).filter((t) =>
    observeToolIds.has(t)
  );
  if (observe.length > 0) {
    components.push({
      id: "observe-clause",
      description: "Vault observation tools elicited by observe instructions",
      attributedTools: [...new Set(observe)],
    });
  }

  const action = (golden.expectedTools ?? []).filter(
    (t) => !observeToolIds.has(t)
  );
  if (action.length > 0) {
    components.push({
      id: "action-clause",
      description: "Action / escalation / request tools from policy clauses",
      attributedTools: [...new Set(action)],
    });
  }

  return components;
}

/**
 * Scores one tool-mask arm against a frozen fixture + golden ($0 OpenRouter).
 */
export function scoreToolMaskArm(input: {
  fixture: TrajectoryFixture;
  golden: TrajectoryGolden;
  maskedTool: string;
  maskMode?: ToolMaskMode;
}): ToolMaskArmResult {
  const maskMode = toolMaskModeSchema.parse(
    input.maskMode ?? "all_occurrences"
  );
  const baseline = scoreTrajectory(input.fixture.toolNames, input.golden);
  const maskedToolNames = maskToolFromTrajectory(
    input.fixture.toolNames,
    input.maskedTool,
    maskMode
  );
  const masked = scoreTrajectory(maskedToolNames, input.golden);
  const loadBearing = baseline.score >= 1 && masked.score < 1;

  return toolMaskArmResultSchema.parse({
    kind: "tool_mask",
    fixtureId: input.fixture.fixtureId,
    scenarioId: input.fixture.scenarioId,
    maskedTool: input.maskedTool,
    maskMode,
    baselineScore: baseline.score,
    maskedScore: masked.score,
    loadBearing,
    baselineReason: baseline.reason,
    maskedReason: masked.reason,
    maskedToolNames,
  });
}

/**
 * Scores one prompt-component LOO arm on a frozen fixture ($0 OpenRouter).
 */
export function scorePromptComponentArm(input: {
  fixture: TrajectoryFixture;
  golden: TrajectoryGolden;
  component: PromptComponent;
}): PromptComponentArmResult {
  const component = promptComponentSchema.parse(input.component);
  const baseline = scoreTrajectory(input.fixture.toolNames, input.golden);
  const maskedToolNames = maskPromptComponentFromTrajectory(
    input.fixture.toolNames,
    component
  );
  const masked = scoreTrajectory(maskedToolNames, input.golden);
  const loadBearing = baseline.score >= 1 && masked.score < 1;

  return promptComponentArmResultSchema.parse({
    kind: "prompt_component",
    fixtureId: input.fixture.fixtureId,
    scenarioId: input.fixture.scenarioId,
    componentId: component.id,
    maskedTools: component.attributedTools,
    baselineScore: baseline.score,
    maskedScore: masked.score,
    loadBearing,
    baselineReason: baseline.reason,
    maskedReason: masked.reason,
    maskedToolNames,
  });
}

export type RunFixtureLooOptions = {
  /** Defaults to all golden-pass fixtures in the bank. */
  fixtures?: TrajectoryFixture[];
  /** Include optional prompt-component LOO arms (default true). */
  includePromptComponents?: boolean;
  /** Override prompt components; when unset, derive from golden. */
  promptComponentsForScenario?: (
    scenarioId: string,
    golden: TrajectoryGolden
  ) => PromptComponent[];
  maskMode?: ToolMaskMode;
  /** Restrict to these fixture ids when set. */
  fixtureIds?: string[];
};

/**
 * Runs fixture-first tool-mask (+ optional prompt-component) leave-one-out.
 * Always $0 OpenRouter — deterministic `scoreTrajectory` only.
 */
export async function runFixtureToolMaskLoo(
  options: RunFixtureLooOptions = {}
): Promise<FixtureLooReport> {
  const includePrompt = options.includePromptComponents !== false;
  const maskMode = toolMaskModeSchema.parse(
    options.maskMode ?? "all_occurrences"
  );

  let fixtures =
    options.fixtures ??
    (await loadAllTrajectoryFixtures()).filter((f) => f.kind === "golden-pass");

  if (options.fixtureIds && options.fixtureIds.length > 0) {
    const allow = new Set(options.fixtureIds);
    fixtures = fixtures.filter((f) => allow.has(f.fixtureId));
  }

  const arms: FixtureLooArmResult[] = [];

  for (const fixture of fixtures) {
    const golden = resolveFixtureTrajectoryGolden(fixture.scenarioId);
    if (!golden) {
      continue;
    }

    // Baseline must pass for load-bearing attribution to be meaningful.
    const baseline = scoreTrajectory(fixture.toolNames, golden);
    if (baseline.score < 1) {
      continue;
    }

    for (const tool of listToolMaskCandidates(fixture.toolNames, golden)) {
      arms.push(
        scoreToolMaskArm({
          fixture,
          golden,
          maskedTool: tool,
          maskMode,
        })
      );
    }

    if (includePrompt) {
      const components =
        options.promptComponentsForScenario?.(fixture.scenarioId, golden) ??
        defaultPromptComponentsForGolden(golden);
      for (const component of components) {
        // Skip components whose attributed tools never appear in the fixture.
        const appears = component.attributedTools.some((t) =>
          fixture.toolNames.includes(t)
        );
        if (!appears) continue;
        arms.push(scorePromptComponentArm({ fixture, golden, component }));
      }
    }
  }

  const loadBearingTools = [
    ...new Set(
      arms
        .filter(
          (a): a is ToolMaskArmResult => a.kind === "tool_mask" && a.loadBearing
        )
        .map((a) => a.maskedTool)
    ),
  ].sort();

  const loadBearingComponents = [
    ...new Set(
      arms
        .filter(
          (a): a is PromptComponentArmResult =>
            a.kind === "prompt_component" && a.loadBearing
        )
        .map((a) => a.componentId)
    ),
  ].sort();

  const inconclusive = isFixtureAblationInconclusive(arms, fixtures.length);
  const inconclusiveReason = inconclusive
    ? explainInconclusive(arms, fixtures.length)
    : undefined;

  return fixtureLooReportSchema.parse({
    mode: "fixture",
    openRouterSpendUsd: 0,
    fixtureCount: fixtures.length,
    arms,
    loadBearingTools,
    loadBearingComponents,
    inconclusive,
    inconclusiveReason,
  });
}

/**
 * Fixture LOO is inconclusive when no golden-pass baseline produced a
 * load-bearing tool arm (golden too loose, empty bank, or fixtures not exercising gates).
 */
export function isFixtureAblationInconclusive(
  arms: readonly FixtureLooArmResult[],
  fixtureCount: number
): boolean {
  if (fixtureCount === 0) return true;
  const toolArms = arms.filter((a) => a.kind === "tool_mask");
  if (toolArms.length === 0) return true;
  return !toolArms.some((a) => a.loadBearing);
}

function explainInconclusive(
  arms: readonly FixtureLooArmResult[],
  fixtureCount: number
): string {
  if (fixtureCount === 0) {
    return "No golden-pass fixtures to ablate";
  }
  const toolArms = arms.filter((a) => a.kind === "tool_mask");
  if (toolArms.length === 0) {
    return "No tool-mask arms scored (missing trajectory goldens?)";
  }
  return "No load-bearing tools found on fixture LOO — live canary LOO may be planned under budget";
}

/**
 * True when live ablation Pilot is explicitly enabled.
 * Default CI must keep this false ($0 OpenRouter).
 */
export function isLiveAblationEnabled(): boolean {
  return env.EVAL_LIVE_ABLATION === true;
}

/**
 * Fails closed unless live ablation is opted in. Still does not spend until a caller runs agents.
 */
export function assertLiveAblationAllowed(): void {
  if (!isLiveAblationEnabled()) {
    throw new Error(
      "Live canary LOO is disabled (set EVAL_LIVE_ABLATION=1). Prefer fixture LOO at $0 OpenRouter."
    );
  }
  if (env.CI && !env.CI_LIVE_EVAL) {
    throw new Error(
      "Live canary LOO refused under CI without CI_LIVE_EVAL=1 (keep default CI at $0 OpenRouter)."
    );
  }
}

/**
 * Plans budgeted live canary LOO batches with shared-prefix grouping.
 * Only call when fixture LOO is inconclusive. Does not invoke OpenRouter.
 * REGULATORY: results of live LOO must not unsupervised-promote compliance prompts.
 */
export function planBudgetedLiveCanaryLoo(input: {
  fixtureReport: FixtureLooReport;
  clientIds?: string[];
  /** Max distinct mask arms to schedule (default 5). */
  maxArms?: number;
  waveId?: string;
}): LiveLooPlan {
  assertLiveAblationAllowed();

  if (!input.fixtureReport.inconclusive) {
    throw new Error(
      "Live canary LOO refused: fixture LOO was conclusive. Keep ablation on fixtures ($0)."
    );
  }

  const maxArms = input.maxArms ?? 5;
  const canaries =
    input.clientIds ??
    GROUND_TRUTH.filter((g) => g.canary === true).map((g) => g.clientId);

  if (canaries.length === 0) {
    throw new Error("Live canary LOO requires at least one canary clientId");
  }

  const waveId = input.waveId ?? `ablation-${Date.now()}`;
  const sessionWaveId = buildLiveEvalSessionId(waveId);

  // Candidate masks: unique expected tools across canary goldens (not fixture-derived,
  // since fixture LOO was inconclusive).
  const candidateTools: string[] = [];
  for (const id of canaries) {
    const golden = resolveFixtureTrajectoryGolden(id);
    for (const t of golden?.expectedTools ?? []) {
      if (!candidateTools.includes(t)) candidateTools.push(t);
    }
  }

  const selected = candidateTools.slice(0, maxArms);
  const batches: LiveLooBatch[] = selected.map((tool) =>
    liveLooBatchSchema.parse({
      batchKey: `mask:${tool}`,
      maskedTool: tool,
      componentId: null,
      clientIds: [...canaries],
      // Same toolset across canaries → shared session for prefix cache amortisation.
      sessionId: `${sessionWaveId}-mask-${tool}`,
    })
  );

  const plan = liveLooPlanSchema.parse({
    mode: "live_canary_planned",
    reason: input.fixtureReport.inconclusiveReason ?? "fixture LOO inconclusive",
    maxArms,
    budgetUsd: env.EVAL_BUDGET_USD,
    sessionWaveId,
    batches,
  });

  // Budget gate: planning itself is free; assert current recorded spend is within cap.
  assertEvalBudget(0);

  return plan;
}

/**
 * Groups live LOO batches so identical toolsets run together (prefix-cache friendly).
 */
export function orderLiveLooBatchesByToolset(
  batches: readonly LiveLooBatch[]
): LiveLooBatch[] {
  return [...batches].sort((a, b) => a.batchKey.localeCompare(b.batchKey));
}
