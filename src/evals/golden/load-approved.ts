import { promises as fs } from "node:fs";
import path from "node:path";
import type { EvalScenario } from "@/evals/ground-truth";
import {
  resolveGoldenRoots,
  type GoldenRoots,
} from "./paths";
import {
  approvedGoldenSchema,
  type ApprovedGolden,
} from "./schemas";
import { readApprovedManifest } from "./promote";

/**
 * Loads a single approved golden file after Zod validation.
 * Files that fail schema or lack `approved: true` are rejected (fail closed).
 */
export async function readApprovedGoldenFile(
  filePath: string
): Promise<ApprovedGolden> {
  const raw = await fs.readFile(filePath, "utf8");
  const data = JSON.parse(raw) as unknown;
  return approvedGoldenSchema.parse(data);
}

/**
 * Loads versioned approved goldens that are BOTH:
 * 1. Listed in approved-manifest.json, and
 * 2. Valid approved golden JSON with `approved: true`.
 *
 * Candidates/ and any unlisted files under approved/ are ignored — unapproved
 * samples never enter the ship gate.
 */
export async function loadApprovedGoldens(
  roots?: GoldenRoots
): Promise<ApprovedGolden[]> {
  const r = roots ?? resolveGoldenRoots();
  const manifest = await readApprovedManifest(r);
  if (manifest.files.length === 0) return [];

  const loaded: ApprovedGolden[] = [];
  for (const fileName of manifest.files) {
    // Path traversal guard — only allow basename files.
    if (fileName.includes("/") || fileName.includes("\\") || fileName.includes("..")) {
      throw new Error(`Invalid golden manifest entry (path traversal): ${fileName}`);
    }
    const filePath = path.join(r.approvedDir, fileName);
    try {
      const golden = await readApprovedGoldenFile(filePath);
      if (golden.approved !== true) {
        // Fail closed: never ship unapproved payloads even if listed.
        continue;
      }
      loaded.push(golden);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        // Manifest entry without file — skip (fail closed for that entry).
        continue;
      }
      throw err;
    }
  }
  return loaded;
}

/**
 * Maps approved goldens to EvalScenario rows for the offline ship suite.
 */
export async function loadApprovedEvalScenarios(
  roots?: GoldenRoots
): Promise<EvalScenario[]> {
  const goldens = await loadApprovedGoldens(roots);
  return goldens.map((g) => ({
    clientId: g.scenario.clientId,
    agentType: g.scenario.agentType,
    trigger: g.scenario.trigger,
    expected: g.scenario.expected,
    canary: g.scenario.canary,
    stratum: g.scenario.stratum,
    sourceIncidentId: g.scenario.sourceIncidentId,
  }));
}

/**
 * Client ids from approved goldens marked canary — merge into hard-gate set.
 */
export async function getApprovedCanaryClientIds(
  roots?: GoldenRoots
): Promise<string[]> {
  const goldens = await loadApprovedGoldens(roots);
  return goldens
    .filter((g) => g.scenario.canary === true)
    .map((g) => g.scenario.clientId);
}
