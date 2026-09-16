import { describe, expect, it } from "vitest";
import {
  citationRowsFromCitedFields,
  citationRowsFromExtract,
  parseExtractedFieldsJson,
} from "@/lib/documents/citations";
import { extractFieldsHeuristic } from "@/lib/documents/extract";

describe("citation display helpers", () => {
  it("maps extract result into labeled rows with excerpts", () => {
    const extract = extractFieldsHeuristic(
      "Full Name: Ada Lovelace\nExpiry Date: 2028-06-30",
      "GOVERNMENT_ID",
    );
    const rows = citationRowsFromExtract(extract);
    expect(rows.some((r) => r.key === "full_name" && r.value === "Ada Lovelace")).toBe(
      true,
    );
    expect(rows.find((r) => r.key === "full_name")?.excerpt).toMatch(/Ada/);
  });

  it("parses ActionLedger citedFields extract shape", () => {
    const rows = citationRowsFromCitedFields({
      extractProvider: "heuristic",
      daysUntilExpiry: 10,
      full_name: {
        value: "Ada Lovelace",
        label: "Full Name",
        confidence: 0.9,
        citation: {
          source: "raw_text",
          startOffset: 0,
          endOffset: 20,
          page: null,
          excerpt: "Full Name: Ada Lovelace",
        },
      },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.label).toBe("Full Name");
    expect(rows[0]?.excerpt).toMatch(/Ada/);
  });

  it("safe-parses invalid extractedFields as null", () => {
    expect(parseExtractedFieldsJson({ bogus: true })).toBeNull();
  });
});
