/**
 * Thrown when the stage × tool policy matrix denies a tool call.
 */
export class PolicyBlockedError extends Error {
  readonly code = "POLICY_BLOCKED" as const;
  readonly toolName: string;
  readonly stage: number;
  readonly policyVersion: string;
  readonly reasonCode: string;

  constructor(opts: {
    toolName: string;
    stage: number;
    policyVersion: string;
    reasonCode: string;
  }) {
    super(
      `Policy blocked tool "${opts.toolName}" at stage ${opts.stage} ` +
        `(${opts.reasonCode}, policyVersion=${opts.policyVersion})`,
    );
    this.name = "PolicyBlockedError";
    this.toolName = opts.toolName;
    this.stage = opts.stage;
    this.policyVersion = opts.policyVersion;
    this.reasonCode = opts.reasonCode;
  }
}

/**
 * Thrown when policy requires advisor approval before side effects (HITL wired in WP-P0.3).
 */
export class PolicyApprovalRequiredError extends Error {
  readonly code = "POLICY_REQUIRES_APPROVAL" as const;
  readonly toolName: string;
  readonly stage: number;
  readonly policyVersion: string;
  readonly reasonCode: string;

  constructor(opts: {
    toolName: string;
    stage: number;
    policyVersion: string;
    reasonCode: string;
  }) {
    super(
      `Policy requires approval for tool "${opts.toolName}" at stage ${opts.stage} ` +
        `(${opts.reasonCode}, policyVersion=${opts.policyVersion})`,
    );
    this.name = "PolicyApprovalRequiredError";
    this.toolName = opts.toolName;
    this.stage = opts.stage;
    this.policyVersion = opts.policyVersion;
    this.reasonCode = opts.reasonCode;
  }
}
