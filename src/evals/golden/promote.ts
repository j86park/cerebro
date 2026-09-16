import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { env } from "@/lib/config";
import {
  approvedGoldenFileName,
  candidateFileName,
  resolveGoldenRoots,
  type GoldenRoots,
} from "./paths";
import {
  approvedGoldenManifestSchema,
  approvedGoldenSchema,
  failureCandidateSchema,
  type ApprovedGolden,
  type ApprovedGoldenManifest,
  type FailureCandidate,
  type GoldenScenarioBody,
} from "./schemas";

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function readJsonFile(filePath: string): Promise<unknown> {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw) as unknown;
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

/**
 * Persists a pending failure candidate. Always writes (DB-equivalent local staging);
 * DRY_RUN does not skip candidate staging — only approved ship-gate writes are gated.
 */
export async function writeFailureCandidate(
  candidate: FailureCandidate,
  roots?: GoldenRoots
): Promise<string> {
  const parsed = failureCandidateSchema.parse(candidate);
  const r = roots ?? resolveGoldenRoots();
  const filePath = path.join(r.candidatesDir, candidateFileName(parsed.candidateId));
  await writeJsonFile(filePath, parsed);
  return filePath;
}

/**
 * Loads a pending candidate by id from candidates/.
 */
export async function readFailureCandidate(
  candidateId: string,
  roots?: GoldenRoots
): Promise<FailureCandidate> {
  const r = roots ?? resolveGoldenRoots();
  const filePath = path.join(r.candidatesDir, candidateFileName(candidateId));
  const data = await readJsonFile(filePath);
  return failureCandidateSchema.parse(data);
}

/**
 * Lists pending candidate ids (filenames without .json).
 */
export async function listPendingCandidateIds(
  roots?: GoldenRoots
): Promise<string[]> {
  const r = roots ?? resolveGoldenRoots();
  try {
    const entries = await fs.readdir(r.candidatesDir);
    return entries
      .filter((f) => f.endsWith(".json") && !f.startsWith("."))
      .map((f) => f.replace(/\.json$/i, ""))
      .sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

/**
 * Reads the approved manifest; missing file ⇒ empty allowlist (fail closed).
 */
export async function readApprovedManifest(
  roots?: GoldenRoots
): Promise<ApprovedGoldenManifest> {
  const r = roots ?? resolveGoldenRoots();
  try {
    const data = await readJsonFile(r.manifestPath);
    return approvedGoldenManifestSchema.parse(data);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { files: [] };
    }
    throw err;
  }
}

/**
 * Appends a filename to the approved manifest (idempotent).
 * REGULATORY: manifest is append-only for filenames — never remove without human review.
 */
export async function appendApprovedManifest(
  fileName: string,
  roots?: GoldenRoots
): Promise<ApprovedGoldenManifest> {
  const r = roots ?? resolveGoldenRoots();
  const current = await readApprovedManifest(r);
  const files = current.files.includes(fileName)
    ? current.files
    : [...current.files, fileName];
  const next = approvedGoldenManifestSchema.parse({
    files,
    updatedAt: env.DEMO_DATE,
  });
  await writeJsonFile(r.manifestPath, next);
  return next;
}

const promoteInputSchema = z.object({
  candidateId: z.string().min(1),
  /** Explicit human approve flag — required; unsupervised promote is rejected. */
  approve: z.literal(true),
  approvedBy: z.string().min(1),
  /**
   * REGULATORY: human confirms the draft scenario encodes correct regulatory expectations.
   * Must be true to write an approved golden.
   */
  regulatoryConfirmed: z.literal(true),
  /** Optional override of draft scenario at approve time (human edit). */
  scenarioOverride: z.custom<GoldenScenarioBody>().optional(),
  scenarioId: z.string().min(1).optional(),
  version: z.number().int().positive().optional(),
  /**
   * When true (default from env.DRY_RUN), do not write approved/ or manifest —
   * return the golden payload that *would* ship. Candidate remains pending.
   */
  dryRun: z.boolean().optional(),
  roots: z.custom<GoldenRoots>().optional(),
});

export type PromoteGoldenInput = z.infer<typeof promoteInputSchema>;

export type PromoteGoldenResult = {
  dryRun: boolean;
  written: boolean;
  fileName: string;
  filePath: string | null;
  golden: ApprovedGolden;
};

/**
 * Human-approved promotion: pending candidate → versioned approved golden + manifest.
 * Unapproved / dry-run paths never mutate the ship-gate approved set.
 *
 * REGULATORY: refuses without `regulatoryConfirmed: true`. Does not append PromptLesson text.
 */
export async function promoteGoldenToApproved(
  input: PromoteGoldenInput
): Promise<PromoteGoldenResult> {
  const parsed = promoteInputSchema.parse(input);
  if (parsed.approve !== true) {
    throw new Error("Golden promotion requires explicit approve: true (human gate)");
  }
  if (parsed.regulatoryConfirmed !== true) {
    throw new Error(
      "REGULATORY: golden promotion requires regulatoryConfirmed: true — incorrect regulatory expectations must not enter the ship gate"
    );
  }

  const roots = parsed.roots ?? resolveGoldenRoots();
  const candidate = await readFailureCandidate(parsed.candidateId, roots);
  if (candidate.approvalStatus !== "pending") {
    throw new Error(
      `Candidate ${parsed.candidateId} is not pending (status=${candidate.approvalStatus})`
    );
  }

  const scenario = parsed.scenarioOverride ?? candidate.draftScenario;
  const scenarioId = parsed.scenarioId ?? scenario.clientId;
  const version = parsed.version ?? 1;
  const fileName = approvedGoldenFileName(scenarioId, version);
  const filePath = path.join(roots.approvedDir, fileName);

  const golden = approvedGoldenSchema.parse({
    scenarioId,
    version,
    approved: true,
    approvedAt: env.DEMO_DATE,
    approvedBy: parsed.approvedBy,
    source: candidate.source,
    scenario,
    failureSnapshot: candidate.failureSnapshot,
    regulatoryConfirmed: true,
    candidateId: candidate.candidateId,
  });

  const dryRun = parsed.dryRun ?? env.DRY_RUN;
  if (dryRun) {
    return {
      dryRun: true,
      written: false,
      fileName,
      filePath: null,
      golden,
    };
  }

  // Append-only: refuse overwrite of an existing approved version file.
  try {
    await fs.access(filePath);
    throw new Error(
      `Approved golden already exists at ${fileName} — bump version instead of mutating (append-only)`
    );
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw err;
    }
  }

  await writeJsonFile(filePath, golden);
  await appendApprovedManifest(fileName, roots);

  // Mark candidate rejected-from-pending by rewriting status — keep file for audit.
  // Prefer leaving candidate as-is for audit trail; write sibling ".promoted" marker.
  await writeJsonFile(
    path.join(roots.candidatesDir, `${candidate.candidateId}.promoted.json`),
    {
      candidateId: candidate.candidateId,
      promotedTo: fileName,
      promotedAt: env.DEMO_DATE,
      approvedBy: parsed.approvedBy,
    }
  );

  return {
    dryRun: false,
    written: true,
    fileName,
    filePath,
    golden,
  };
}

/**
 * Reject path — records rejection without touching approved/ or ship gate.
 */
export async function rejectFailureCandidate(params: {
  candidateId: string;
  rejectedBy: string;
  reason: string;
  roots?: GoldenRoots;
}): Promise<string> {
  const roots = params.roots ?? resolveGoldenRoots();
  const candidate = await readFailureCandidate(params.candidateId, roots);
  const outPath = path.join(
    roots.candidatesDir,
    `${candidate.candidateId}.rejected.json`
  );
  await writeJsonFile(outPath, {
    candidateId: candidate.candidateId,
    rejectedBy: params.rejectedBy,
    reason: params.reason,
    rejectedAt: env.DEMO_DATE,
  });
  return outPath;
}
