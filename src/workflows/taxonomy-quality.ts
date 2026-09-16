import { z } from "zod";
import {
  taxonomyReportSchema,
  type TaxonomyReport,
} from "@/workflows/types";

const qualityFindingSchema = z.object({
  failingScorerId: z.string().min(1),
  evidenceSpan: z.string().min(8),
});

/**
 * Quality bar for meta-agent taxonomy findings (WP-P1.6).
 * Every finding must cite a failing scorer id and a non-trivial evidence span.
 */
export function assertTaxonomyQualityBars(taxonomy: TaxonomyReport): void {
  const parsed = taxonomyReportSchema.safeParse(taxonomy);
  if (!parsed.success) {
    throw new Error(
      `Taxonomy quality bar failed: schema invalid (${parsed.error.message})`,
    );
  }
  if (parsed.data.findings.length === 0) {
    throw new Error("Taxonomy quality bar failed: findings array is empty");
  }
  for (const [index, finding] of parsed.data.findings.entries()) {
    const check = qualityFindingSchema.safeParse(finding);
    if (!check.success) {
      throw new Error(
        `Taxonomy quality bar failed for findings[${index}] (${finding.scenarioId}): ` +
          `must cite failingScorerId and evidenceSpan (≥8 chars). ${check.error.message}`,
      );
    }
    if (!finding.scorerReasoning.trim()) {
      throw new Error(
        `Taxonomy quality bar failed for findings[${index}]: scorerReasoning is empty`,
      );
    }
  }
  if (!parsed.data.recommendedMutation.trim()) {
    throw new Error("Taxonomy quality bar failed: recommendedMutation is empty");
  }
}
