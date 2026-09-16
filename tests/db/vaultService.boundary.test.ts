import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const PRISMA_IMPORT =
  /from\s+["']@\/lib\/db\/client["']|from\s+["']@prisma\/client["']|\bprisma\./;

/**
 * Walks TypeScript sources under a directory and returns files that appear to
 * import or call prisma directly (forbidden in tools/agents).
 */
function findPrismaBypasses(rootDir: string): string[] {
  const hits: string[] = [];

  function walk(dir: string): void {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.endsWith(".ts") && !entry.endsWith(".tsx")) continue;
      const text = readFileSync(full, "utf8");
      if (PRISMA_IMPORT.test(text)) {
        hits.push(full);
      }
    }
  }

  walk(rootDir);
  return hits;
}

describe("VaultService boundary", () => {
  it("tools and agents must not import prisma (ledger writes only via VaultService)", () => {
    const roots = [
      join(process.cwd(), "src/tools"),
      join(process.cwd(), "src/agents"),
    ];
    const hits = roots.flatMap((root) => findPrismaBypasses(root));
    expect(hits).toEqual([]);
  });
});
