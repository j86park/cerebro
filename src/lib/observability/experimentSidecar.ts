import { z } from "zod";
import { env } from "@/lib/config";

/**
 * Optional Braintrust / LangSmith experiment UI sidecar (SOTA P2.4 watch).
 * Never the CI system of record — ship gate stays Vitest frozen/trajectory fixtures.
 */

export const experimentSidecarProviderSchema = z.enum([
  "off",
  "braintrust",
  "langsmith",
]);

export type ExperimentSidecarProvider = z.infer<
  typeof experimentSidecarProviderSchema
>;

export const experimentRunMetaSchema = z.object({
  runId: z.string().min(1),
  jobId: z.string().min(1).optional(),
  agentName: z.enum(["compliance", "onboarding"]).optional(),
  /** Redacted summary only — never full prompt/completion by default. */
  summary: z.string().max(2000).optional(),
  scores: z.record(z.string(), z.number()).optional(),
});

export type ExperimentRunMeta = z.infer<typeof experimentRunMetaSchema>;

export const experimentExportResultSchema = z.enum(["skipped", "exported"]);

export type ExperimentExportResult = z.infer<
  typeof experimentExportResultSchema
>;

/**
 * Sidecar contract for exporting eval/run metadata to an experiment UI.
 */
export type ExperimentSidecar = {
  readonly provider: ExperimentSidecarProvider;
  exportRun(meta: ExperimentRunMeta): Promise<ExperimentExportResult>;
};

/**
 * No-op sidecar used when `EXPERIMENT_SIDECAR=off` (default).
 */
export function createNoopExperimentSidecar(): ExperimentSidecar {
  return {
    provider: "off",
    async exportRun(meta) {
      experimentRunMetaSchema.parse(meta);
      return "skipped";
    },
  };
}

/**
 * Stub for Braintrust / LangSmith — throws until credentials + SDK are wired.
 * Prefer noop (`off`) in CI; never required for merge gates.
 */
export function createConfiguredExperimentSidecar(
  provider: ExperimentSidecarProvider,
): ExperimentSidecar {
  const parsed = experimentSidecarProviderSchema.parse(provider);

  if (parsed === "off") {
    return createNoopExperimentSidecar();
  }

  return {
    provider: parsed,
    async exportRun(meta) {
      experimentRunMetaSchema.parse(meta);
      if (env.DRY_RUN) {
        return "skipped";
      }
      throw new Error(
        `Experiment sidecar '${parsed}' is not configured. ` +
          "Set EXPERIMENT_SIDECAR=off (default) for CI; " +
          "wire vendor SDK + credentials only for optional experiment UI.",
      );
    },
  };
}

/**
 * Resolves the experiment sidecar from `env.EXPERIMENT_SIDECAR`.
 */
export function getExperimentSidecar(): ExperimentSidecar {
  return createConfiguredExperimentSidecar(env.EXPERIMENT_SIDECAR);
}
