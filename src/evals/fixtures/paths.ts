import path from "node:path";

/**
 * Absolute root for versioned trajectory fixtures (cheap-eval PR0 $0 CI bank).
 */
export function getTrajectoryFixturesDir(
  cwd: string = process.cwd()
): string {
  return path.join(cwd, "src", "evals", "fixtures", "trajectories");
}

/**
 * Resolves a fixture JSON path by fixture id (filename stem).
 */
export function resolveTrajectoryFixturePath(
  fixtureId: string,
  cwd: string = process.cwd()
): string {
  return path.join(getTrajectoryFixturesDir(cwd), `${fixtureId}.json`);
}
