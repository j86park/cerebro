import type { EvalRun } from "@prisma/client";
import { getComplianceAgent } from "@/agents/compliance/agent";
import { getOnboardingAgent } from "@/agents/onboarding/agent";
import { prisma } from "@/lib/db/client";
import { isFullyPassingScores } from "@/lib/eval-scenario-utils";
import { taxonomyReportSchema, type TaxonomyReport } from "./types";

type ScenarioEvalJson = {
  agent?: string;
  scores?: Record<string, { score?: number; reason?: string }>;
};

/**
 * Loads the eval run under analysis plus recent history for recurrence context.
 */
export async function analyzeEvalRun(evalRunId: string): Promise<{
  evalRun: EvalRun;
  recentRuns: EvalRun[];
}> {
  const evalRun = await prisma.evalRun.findUniqueOrThrow({
    where: { id: evalRunId },
  });
  const recentRuns = await prisma.evalRun.findMany({
    take: 50,
    orderBy: { runAt: "desc" },
    where: { id: { not: evalRunId } },
  });
  return { evalRun, recentRuns };
}

function extractJsonObject(text: string): unknown {
  const t = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(t);
  const body = fence ? fence[1]!.trim() : t;
  return JSON.parse(body) as unknown;
}

function pickAgentIdFromEvalRun(
  scenarioResults: Record<string, ScenarioEvalJson>
): "compliance" | "onboarding" {
  for (const row of Object.values(scenarioResults)) {
    if (!row.scores) continue;
    if (!isFullyPassingScores(row.scores)) {
      return row.agent === "COMPLIANCE" ? "compliance" : "onboarding";
    }
  }
  return "compliance";
}

async function getAgentForMeta(agentId: "compliance" | "onboarding") {
  return agentId === "compliance"
    ? getComplianceAgent()
    : getOnboardingAgent();
}

/**
 * Runs LLM taxonomy classification over the failed eval; output must match `TaxonomyReport`.
 */
export async function buildTaxonomy(
  evalRun: EvalRun,
  recentRuns: EvalRun[]
): Promise<TaxonomyReport> {
  const scenarioResults = evalRun.scenarioResults as Record<string, ScenarioEvalJson>;
  const scorerBreakdown = evalRun.scorerBreakdown;
  const agentId = pickAgentIdFromEvalRun(scenarioResults);
  const agent = await getAgentForMeta(agentId);

  const historySnippet = recentRuns.map((r) => ({
    id: r.id,
    runAt: r.runAt,
    scenarioResults: r.scenarioResults,
  }));

  const userPrompt =
    `Current eval run id: ${evalRun.id}\n\n` +
    `scenarioResults (this run):\n${JSON.stringify(scenarioResults)}\n\n` +
    `scorerBreakdown (this run):\n${JSON.stringify(scorerBreakdown)}\n\n` +
    `Prior eval scenarioResults (up to 50 runs, JSON array):\n${JSON.stringify(historySnippet)}\n\n` +
    `Identify all failing scenarios (any scorer score < 1). Classify each into a FailureType ` +
    `(tool_selection | reasoning_truncation | context_misinterpretation | over_hedging | format_noncompliance). ` +
    `Find the dominant failure type. Write one imperative instruction sentence that would prevent it. ` +
    `Respond ONLY with a valid JSON object matching this shape: ` +
    `{"agentId":"compliance"|"onboarding","evalRunId":string,"findings":` +
    `[{"scenarioId":string,"agentId":string,"failureType":string,"triggerPattern":string,"scorerReasoning":string,"proposedInstruction":string}],` +
    `"dominantFailureType":string,"recommendedMutation":string} — no prose, no markdown.`;

  const gen = await agent.generate(userPrompt, {
    memory: { thread: `meta-taxonomy-${evalRun.id}`, resource: "eval-meta" },
  });

  const raw = extractJsonObject(gen.text ?? "");
  const parsed = taxonomyReportSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `Taxonomy JSON parse failed: ${parsed.error.message}; raw: ${String(gen.text).slice(0, 500)}`
    );
  }

  if (parsed.data.evalRunId !== evalRun.id) {
    return { ...parsed.data, evalRunId: evalRun.id };
  }
  return parsed.data;
}

/**
 * Persists three inactive prompt candidates and links them to a `PromptMutationJob`.
 */
export async function mutatePrompt(taxonomy: TaxonomyReport): Promise<{
  candidateVersionIds: string[];
  mutationJobId: string;
  taxonomy: TaxonomyReport;
}> {
  if (taxonomy.findings.length === 0) {
    throw new Error("mutatePrompt: taxonomy has no findings; aborting");
  }

  const active = await prisma.promptVersion.findFirst({
    where: { agentId: taxonomy.agentId, isActive: true },
  });
  if (!active) {
    throw new Error(
      "No active PromptVersion for agent; run: node --env-file=.env.local --import tsx prisma/seeds/seed-prompt-versions.ts"
    );
  }

  const jobRow = await prisma.promptMutationJob.create({
    data: {
      agentId: taxonomy.agentId,
      triggerEvalRunId: taxonomy.evalRunId,
      taxonomy: taxonomy as object,
      status: "mutating",
      expectedShadowRuns: 3,
      candidateVersionIds: [],
    },
  });

  const agent = await getAgentForMeta(
    taxonomy.agentId === "onboarding" ? "onboarding" : "compliance"
  );

  const candidateVersionIds: string[] = [];

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const instruction =
      `You are editing a system prompt. Append the following new rule to the prompt. ` +
      `Do NOT restructure, reorder, or remove anything. Find the most relevant existing section ` +
      `and add it there as a new list item. If no relevant section exists, add a new section titled '## Additional rules'. ` +
      `Vary the phrasing slightly from previous attempts (this is attempt ${attempt} of 3).\n\n` +
      `New rule to integrate:\n${taxonomy.recommendedMutation}\n\n` +
      `Full current prompt:\n${active.content}\n\n` +
      `Respond ONLY with the complete mutated prompt text — no markdown fences, no commentary.`;

    const gen = await agent.generate(instruction, {
      memory: {
        thread: `meta-mutate-${jobRow.id}-${attempt}`,
        resource: "eval-meta",
      },
    });

    const mutated = (gen.text ?? "").trim();
    if (!mutated) {
      throw new Error(`mutatePrompt: empty mutation on attempt ${attempt}`);
    }

    const version = await prisma.promptVersion.create({
      data: {
        agentId: taxonomy.agentId,
        content: mutated,
        parentVersionId: active.id,
        isActive: false,
        mutationReason: taxonomy.recommendedMutation,
      },
    });
    candidateVersionIds.push(version.id);
  }

  await prisma.promptMutationJob.update({
    where: { id: jobRow.id },
    data: {
      candidateVersionIds,
      status: "shadow_running",
    },
  });

  return {
    candidateVersionIds,
    mutationJobId: jobRow.id,
    taxonomy,
  };
}
