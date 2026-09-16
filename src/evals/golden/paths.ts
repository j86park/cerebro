import path from "node:path";

/**
 * Default on-disk roots for golden promotion artifacts under the eval scenarios tree.
 * Candidates are never loaded into the ship suite; only approved/ + manifest are.
 */
export type GoldenRoots = {
  /** Absolute path to candidates/ (pending human review). */
  candidatesDir: string;
  /** Absolute path to approved/ (versioned ship-gate goldens). */
  approvedDir: string;
  /** Absolute path to approved-manifest.json. */
  manifestPath: string;
};

/**
 * Resolves golden directory roots. Override `baseDir` in tests (temp dirs).
 */
export function resolveGoldenRoots(baseDir?: string): GoldenRoots {
  const root =
    baseDir ??
    path.join(process.cwd(), "src", "evals", "scenarios", "goldens");
  return {
    candidatesDir: path.join(root, "candidates"),
    approvedDir: path.join(root, "approved"),
    manifestPath: path.join(root, "approved-manifest.json"),
  };
}

/**
 * Builds an approved golden filename: `{scenarioId}.v{version}.json`.
 */
export function approvedGoldenFileName(scenarioId: string, version: number): string {
  return `${scenarioId}.v${version}.json`;
}

/**
 * Builds a pending candidate filename: `{candidateId}.json`.
 */
export function candidateFileName(candidateId: string): string {
  return `${candidateId}.json`;
}
