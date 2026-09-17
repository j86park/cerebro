import { promises as fs } from "node:fs";
import path from "node:path";
import {
  trajectoryFixtureSchema,
  type TrajectoryFixture,
} from "./schemas";
import {
  getTrajectoryFixturesDir,
  resolveTrajectoryFixturePath,
} from "./paths";

/**
 * Loads and Zod-validates a single trajectory fixture by id.
 * Missing file or invalid JSON/schema throws (fail closed — never silent green).
 */
export async function loadTrajectoryFixture(
  fixtureId: string,
  cwd: string = process.cwd()
): Promise<TrajectoryFixture> {
  const filePath = resolveTrajectoryFixturePath(fixtureId, cwd);
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Trajectory fixture missing or unreadable: ${fixtureId} (${filePath}): ${message}`
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(raw) as unknown;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Trajectory fixture JSON parse failed for ${fixtureId}: ${message}`
    );
  }

  const parsed = trajectoryFixtureSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(
      `Trajectory fixture schema invalid for ${fixtureId}: ${parsed.error.message}`
    );
  }

  if (parsed.data.fixtureId !== fixtureId) {
    throw new Error(
      `Trajectory fixture id mismatch: file stem "${fixtureId}" vs body fixtureId "${parsed.data.fixtureId}"`
    );
  }

  return parsed.data;
}

/**
 * Lists all `*.json` fixture ids under the trajectories directory (sorted).
 */
export async function listTrajectoryFixtureIds(
  cwd: string = process.cwd()
): Promise<string[]> {
  const dir = getTrajectoryFixturesDir(cwd);
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Trajectory fixtures directory missing (${dir}): ${message}`);
  }

  return entries
    .filter((name) => name.endsWith(".json"))
    .map((name) => path.basename(name, ".json"))
    .sort();
}

/**
 * Loads every trajectory fixture in the bank.
 */
export async function loadAllTrajectoryFixtures(
  cwd: string = process.cwd()
): Promise<TrajectoryFixture[]> {
  const ids = await listTrajectoryFixtureIds(cwd);
  return Promise.all(ids.map((id) => loadTrajectoryFixture(id, cwd)));
}
