import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("database-backed app pages", () => {
  it("are explicitly runtime-rendered so builds do not require DATABASE_URL", async () => {
    for (const page of ["dashboard/page.tsx", "testing/page.tsx"]) {
      const source = readFileSync(resolve(process.cwd(), "src/app", page), "utf8");
      expect(source).toContain('export const dynamic = "force-dynamic"');
    }
  });
});
