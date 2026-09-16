export {
  failureCandidateSchema,
  approvedGoldenSchema,
  approvedGoldenManifestSchema,
  expectedOutcomeSchema,
  goldenScenarioBodySchema,
  failureSnapshotSchema,
  type FailureCandidate,
  type ApprovedGolden,
  type ApprovedGoldenManifest,
  type GoldenScenarioBody,
  type FailureSnapshot,
} from "./schemas";

export {
  resolveGoldenRoots,
  approvedGoldenFileName,
  candidateFileName,
  type GoldenRoots,
} from "./paths";

export {
  buildFailureSnapshotFromEvalRow,
  draftScenarioFromFailure,
  exportFailureCandidateFromEvalRow,
  exportSyntheticFailureCandidate,
} from "./export-failure";

export {
  writeFailureCandidate,
  readFailureCandidate,
  listPendingCandidateIds,
  readApprovedManifest,
  appendApprovedManifest,
  promoteGoldenToApproved,
  rejectFailureCandidate,
  type PromoteGoldenInput,
  type PromoteGoldenResult,
} from "./promote";

export {
  loadApprovedGoldens,
  loadApprovedEvalScenarios,
  getApprovedCanaryClientIds,
  readApprovedGoldenFile,
} from "./load-approved";
