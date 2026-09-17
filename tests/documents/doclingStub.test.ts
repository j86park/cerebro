import { describe, expect, it } from "vitest";
import { env } from "@/lib/config";
import {
  createDoclingExtractAdapter,
  getDocumentExtractAdapter,
  normalizeDoclingFixture,
} from "@/lib/documents/extract";

describe("docling extract stub (SOTA P2.2 watch)", () => {
  it("stub throws when sidecar is not configured", async () => {
    await expect(
      getDocumentExtractAdapter("docling").extract({
        rawText: "GOVERNMENT ID\nFull Name: Ada",
        documentType: "GOVERNMENT_ID",
      }),
    ).rejects.toThrow(/docling.*not configured/i);
  });

  it("normalizes Docling-like fixture into DocumentExtractResult", () => {
    const result = normalizeDoclingFixture({
      documentType: "GOVERNMENT_ID",
      rawText: "Full Name: Ada Lovelace",
      fields: [
        {
          key: "full_name",
          label: "Full Name",
          value: "Ada Lovelace",
          confidence: 0.91,
          startOffset: 11,
          endOffset: 23,
          excerpt: "Ada Lovelace",
        },
      ],
      extractedAt: env.DEMO_DATE,
    });

    expect(result.provider).toBe("docling");
    expect(result.fields[0]?.key).toBe("full_name");
    expect(result.fields[0]?.citation.source).toBe("raw_text");
    expect(result.adapterNotes[0]).toMatch(/fixture/i);
  });

  it("fixture marker path extracts without OpenRouter", async () => {
    const fixturePayload = JSON.stringify({
      documentType: "GOVERNMENT_ID",
      fields: [
        {
          key: "expiry_date",
          value: "2028-06-30",
          page: 1,
        },
      ],
      extractedAt: env.DEMO_DATE,
    });

    const result = await createDoclingExtractAdapter().extract({
      rawText: `__DOCLING_FIXTURE__:${fixturePayload}`,
      documentType: "GOVERNMENT_ID",
    });

    expect(result.provider).toBe("docling");
    expect(result.fields[0]?.value).toBe("2028-06-30");
    expect(result.fields[0]?.citation.source).toBe("page");
  });
});
