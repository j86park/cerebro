import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { env } from "@/lib/config";
import { hashTrajectoryFixtureContent } from "@/evals/fixtures/hash";
import {
  getTrajectoryFixturesDir,
  resolveTrajectoryFixturePath,
} from "@/evals/fixtures/paths";
import {
  trajectoryFixtureSchema,
  type TrajectoryFixture,
} from "@/evals/fixtures/schemas";
import type { ApprovedGolden } from "./schemas";

const bridgeInputSchema = z.object({
  golden: z.custom<ApprovedGolden>(),
  /**
   * When true (default from env.DRY_RUN), do not write the fixture file —
   * return the payload that *would* land in the $0 CI bank.
   */
  dryRun: z.boolean().optional(),
  /** Override fixtures directory (tests). */
  fixturesDir: z.string().optional(),
  /** Observed tools for the golden-pass fixture (defaults to expectedTools). */
  toolNames: z.array(z.string().min(1)).optional(),
});

export type PromoteTrajectoryFixtureInput = z.infer<typeof bridgeInputSchema>;

export type PromoteTrajectoryFixtureResult = {
  dryRun: boolean;
  written: boolean;
  fixtureId: string;
  filePath: string | null;
  fixture: TrajectoryFixture;
};

/**
 * Builds a $0 CI trajectory fixture draft from a human-approved golden.
 * REGULATORY: only call after promoteGoldenToApproved with regulatoryConfirmed.
 * Never auto-invoked from online judge / mutation workers.
 */
export function buildTrajectoryFixtureFromApprovedGolden(
  golden: ApprovedGolden,
  toolNames?: string[],
): TrajectoryFixture {
  const expected =
    golden.scenario.expected.trajectory?.expectedTools?.filter(Boolean) ?? [];
  const tools =
    toolNames && toolNames.length > 0
      ? toolNames
      : expected.length > 0
        ? expected
        : golden.failureSnapshot?.toolNames?.filter(Boolean) ?? [];

  if (tools.length === 0) {
    throw new Error(
      "Cannot bridge approved golden to trajectory fixture without toolNames / expectedTools",
    );
  }

  const fixtureId = `${golden.scenarioId.toLowerCase()}-pass`;
  return trajectoryFixtureSchema.parse({
    fixtureId,
    scenarioId: golden.scenario.clientId,
    kind: "golden-pass",
    toolNames: tools,
    contentHash: hashTrajectoryFixtureContent(golden.scenario.clientId, tools),
    demoDate: env.DEMO_DATE,
    note: `Bridged from approved golden ${golden.scenarioId}.v${golden.version} (human promote)`,
  });
}

/**
 * Writes (or dry-runs) a trajectory fixture into the PR0 $0 CI bank after human promote.
 * Append-only: refuses overwrite of an existing fixture file.
 */
export async function promoteApprovedGoldenToTrajectoryFixture(
  input: PromoteTrajectoryFixtureInput,
): Promise<PromoteTrajectoryFixtureResult> {
  const parsed = bridgeInputSchema.parse(input);
  const fixture = buildTrajectoryFixtureFromApprovedGolden(
    parsed.golden,
    parsed.toolNames,
  );
  const dryRun = parsed.dryRun ?? env.DRY_RUN;
  const filePath = parsed.fixturesDir
    ? path.join(parsed.fixturesDir, `${fixture.fixtureId}.json`)
    : resolveTrajectoryFixturePath(fixture.fixtureId);

  if (dryRun) {
    return {
      dryRun: true,
      written: false,
      fixtureId: fixture.fixtureId,
      filePath: null,
      fixture,
    };
  }

  try {
    await fs.access(filePath);
    throw new Error(
      `Trajectory fixture already exists at ${fixture.fixtureId}.json — bump id / version instead of mutating (append-only)`,
    );
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw err;
    }
  }

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");

  return {
    dryRun: false,
    written: true,
    fixtureId: fixture.fixtureId,
    filePath,
    fixture,
  };
}

/**
 * Default fixtures dir helper for tests / CLIs.
 */
export function defaultTrajectoryFixturesDir(cwd?: string): string {
  return getTrajectoryFixturesDir(cwd);
}
