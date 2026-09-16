import { describe, expect, it } from "vitest";
import {
  citedFieldsFromExtract,
  extractFieldsHeuristic,
  getDocumentExtractAdapter,
  runDocumentExtract,
} from "@/lib/documents/extract";

const SAMPLE_TEXT = `
GOVERNMENT ID
Full Name: Ada Lovelace
Date of Birth: 1815-12-10
Document Number: DL-998877
Expiry Date: 2028-06-30
Address: 12 Analytical Engine Rd, London
Issue Date: 2020-01-15
`.trim();

describe("document extract adapter", () => {
  it("heuristic adapter extracts labeled fields with raw_text citations", async () => {
    const result = await runDocumentExtract(
      { rawText: SAMPLE_TEXT, documentType: "GOVERNMENT_ID" },
      { provider: "heuristic" },
    );

    expect(result.provider).toBe("heuristic");
    expect(result.fields.map((f) => f.key)).toEqual(
      expect.arrayContaining([
        "full_name",
        "date_of_birth",
        "expiry_date",
        "document_number",
        "address",
        "issue_date",
      ]),
    );
    const name = result.fields.find((f) => f.key === "full_name");
    expect(name?.value).toBe("Ada Lovelace");
    expect(name?.citation.source).toBe("raw_text");
    expect(name?.citation.startOffset).toBeTypeOf("number");
    expect(name?.citation.excerpt).toMatch(/Ada Lovelace/);
  });

  it("llm-demo falls back to heuristic under DRY_RUN/test defaults", async () => {
    const result = await runDocumentExtract(
      { rawText: SAMPLE_TEXT, documentType: "GOVERNMENT_ID" },
      { provider: "llm-demo" },
    );
    expect(result.provider).toBe("llm-demo");
    expect(result.fields.length).toBeGreaterThan(0);
    expect(result.adapterNotes.some((n) => /heuristic/i.test(n))).toBe(true);
  });

  it("textract and persona stubs fail closed with clear errors", async () => {
    await expect(
      getDocumentExtractAdapter("textract").extract({
        rawText: SAMPLE_TEXT,
        documentType: "GOVERNMENT_ID",
      }),
    ).rejects.toThrow(/textract.*not configured/i);

    await expect(
      getDocumentExtractAdapter("persona").extract({
        rawText: SAMPLE_TEXT,
        documentType: "GOVERNMENT_ID",
      }),
    ).rejects.toThrow(/persona.*not configured/i);
  });

  it("citedFieldsFromExtract flattens fields for ActionLedger", () => {
    const extract = extractFieldsHeuristic(SAMPLE_TEXT, "GOVERNMENT_ID");
    const cited = citedFieldsFromExtract(extract);
    expect(cited.extractProvider).toBe("heuristic");
    expect(cited.full_name).toMatchObject({
      value: "Ada Lovelace",
      label: "Full Name",
    });
  });

  it("returns empty fields when no labels match", () => {
    const extract = extractFieldsHeuristic("blank page", "NAAF");
    expect(extract.fields).toHaveLength(0);
    expect(extract.adapterNotes[0]).toMatch(/no labeled fields/i);
  });
});
