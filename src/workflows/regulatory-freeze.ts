import { z } from "zod";

/**
 * Line-oriented REGULATORY sections: any line containing the marker, plus
 * contiguous following lines until a blank line or a new top-level heading.
 * Used to freeze regulated prompt text under meta-agent mutate (WP-P1.6).
 */
export const REGULATORY_MARKER = "REGULATORY:";

const regulatoryBlockSchema = z.object({
  startLine: z.number().int().min(0),
  endLine: z.number().int().min(0),
  text: z.string().min(1),
});

export type RegulatoryBlock = z.infer<typeof regulatoryBlockSchema>;

/**
 * Extracts REGULATORY-marked blocks from a system prompt.
 */
export function extractRegulatoryBlocks(prompt: string): RegulatoryBlock[] {
  const lines = prompt.split("\n");
  const blocks: RegulatoryBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (!line.includes(REGULATORY_MARKER)) {
      i += 1;
      continue;
    }
    const startLine = i;
    i += 1;
    while (i < lines.length) {
      const next = lines[i] ?? "";
      if (next.trim() === "") break;
      if (/^[A-Z][A-Z0-9 /&-]{2,}:\s*$/.test(next.trim())) break;
      if (next.includes(REGULATORY_MARKER)) break;
      i += 1;
    }
    const endLine = i - 1;
    const text = lines.slice(startLine, endLine + 1).join("\n").trim();
    if (text.length > 0) {
      blocks.push(regulatoryBlockSchema.parse({ startLine, endLine, text }));
    }
  }
  return blocks;
}

/**
 * REGULATORY: mutated prompts must preserve every REGULATORY block verbatim (additive-only).
 * Returns missing blocks; empty array means freeze satisfied.
 */
export function findMissingRegulatoryBlocks(
  original: string,
  mutated: string,
): RegulatoryBlock[] {
  const blocks = extractRegulatoryBlocks(original);
  return blocks.filter((block) => !mutated.includes(block.text));
}

/**
 * Asserts REGULATORY sections were not deleted or rewritten.
 */
export function assertRegulatorySectionsPreserved(
  original: string,
  mutated: string,
): void {
  const missing = findMissingRegulatoryBlocks(original, mutated);
  if (missing.length > 0) {
    throw new Error(
      `REGULATORY section freeze violated: ${missing.length} block(s) missing or rewritten. ` +
        `First missing starts with: ${missing[0]!.text.slice(0, 120)}`,
    );
  }
}
