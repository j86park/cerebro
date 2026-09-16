import { describe, expect, it } from "vitest";
import {
  assertRegulatorySectionsPreserved,
  extractRegulatoryBlocks,
  findMissingRegulatoryBlocks,
} from "@/workflows/regulatory-freeze";
import { assertTaxonomyQualityBars } from "@/workflows/taxonomy-quality";
import type { TaxonomyReport } from "@/workflows/types";

const samplePrompt = `
You are an agent.

ESCALATION:
REGULATORY: Never skip stage 4 HITL
REGULATORY: Never silent auto-approve

OTHER RULES:
Be polite.
`.trim();

function validTaxonomy(): TaxonomyReport {
  return {
    agentId: "compliance",
    evalRunId: "eval-1",
    dominantFailureType: "tool_selection",
    recommendedMutation: "Always call getActionHistory before escalating.",
    findings: [
      {
        scenarioId: "clt-1",
        agentId: "compliance",
        failureType: "tool_selection",
        triggerPattern: "skipped getActionHistory",
        scorerReasoning: "Used escalate without history check",
        failingScorerId: "trajectoryScorer",
        evidenceSpan: "toolCalls: escalateToComplianceOfficer without getActionHistory",
        proposedInstruction: "Call getActionHistory first.",
      },
    ],
  };
}

describe("regulatory freeze", () => {
  it("extracts REGULATORY-marked lines as blocks", () => {
    const blocks = extractRegulatoryBlocks(samplePrompt);
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    expect(blocks[0]?.text).toContain("REGULATORY: Never skip stage 4 HITL");
  });

  it("allows additive mutations that keep REGULATORY text", () => {
    const mutated =
      samplePrompt + "\n\n## Additional rules\n- Log every escalate.\n";
    expect(findMissingRegulatoryBlocks(samplePrompt, mutated)).toHaveLength(0);
    expect(() =>
      assertRegulatorySectionsPreserved(samplePrompt, mutated),
    ).not.toThrow();
  });

  it("rejects deletions of REGULATORY text", () => {
    const mutated = samplePrompt.replace(
      "REGULATORY: Never silent auto-approve\n",
      "",
    );
    expect(findMissingRegulatoryBlocks(samplePrompt, mutated).length).toBeGreaterThan(
      0,
    );
    expect(() =>
      assertRegulatorySectionsPreserved(samplePrompt, mutated),
    ).toThrow(/REGULATORY section freeze/);
  });
});

describe("taxonomy quality bars", () => {
  it("accepts findings that cite scorer + evidence", () => {
    expect(() => assertTaxonomyQualityBars(validTaxonomy())).not.toThrow();
  });

  it("rejects findings missing failingScorerId or evidenceSpan", () => {
    const bad = validTaxonomy();
    // Simulate pre-schema LLM omission by casting after strip
    const stripped = {
      ...bad,
      findings: [
        {
          ...bad.findings[0]!,
          failingScorerId: "",
          evidenceSpan: "short",
        },
      ],
    };
    expect(() => assertTaxonomyQualityBars(stripped)).toThrow(/quality bar/i);
  });

  it("rejects empty findings", () => {
    const empty = { ...validTaxonomy(), findings: [] };
    expect(() => assertTaxonomyQualityBars(empty)).toThrow(/empty/i);
  });
});
