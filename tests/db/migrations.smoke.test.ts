import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Optional CI gate: ensures an initial migration is committed.
 * Full `prisma migrate deploy` against a live DB belongs in integration CI.
 */
describe("prisma migrations (smoke)", () => {
  it("has committed init migration SQL", () => {
    const migrationFile = resolve(
      process.cwd(),
      "prisma/migrations/20250319183000_init/migration.sql"
    );
    expect(existsSync(migrationFile)).toBe(true);
  });
});
