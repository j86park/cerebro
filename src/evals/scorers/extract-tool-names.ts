/**
 * Extracts ordered tool names from agent `generate` output (Mastra / AI SDK shapes).
 */
export function extractToolNamesFromOutput(output: unknown): string[] {
  if (output === null || output === undefined) return [];

  if (typeof output === "string") {
    // Best-effort: quoted tool ids in prose / JSON dumps
    const names: string[] = [];
    const re =
      /\b(getClientProfile|getActionHistory|getDocumentComplianceStatus|getOnboardingStatus|logAction|sendAdvisorAlert|sendClientReminder|escalateToComplianceOfficer|escalateToManagement|updateDocumentStatus|requestDocument|validateDocumentReceived|advanceOnboardingStage|completeOnboarding|alertAdvisorStuck|scanVault)\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(output)) !== null) {
      names.push(m[1]!);
    }
    return names;
  }

  if (typeof output !== "object") return [];

  const rec = output as Record<string, unknown>;
  const collected: string[] = [];

  const pushCall = (call: unknown) => {
    if (typeof call !== "object" || call === null) return;
    const c = call as Record<string, unknown>;
    const name =
      (typeof c.name === "string" && c.name) ||
      (typeof c.toolName === "string" && c.toolName) ||
      (typeof c.id === "string" && c.id) ||
      null;
    if (name) collected.push(name);

    // Nested payload shapes: { toolCallId, toolName } / { payload: { toolName } }
    const payload = c.payload;
    if (typeof payload === "object" && payload !== null) {
      const p = payload as Record<string, unknown>;
      if (typeof p.toolName === "string") collected.push(p.toolName);
      if (typeof p.name === "string") collected.push(p.name);
    }
  };

  if (Array.isArray(rec.toolCalls)) {
    for (const call of rec.toolCalls) pushCall(call);
  }

  // Multi-step agent results: steps[].toolCalls
  if (Array.isArray(rec.steps)) {
    for (const step of rec.steps) {
      if (typeof step !== "object" || step === null) continue;
      const s = step as Record<string, unknown>;
      if (Array.isArray(s.toolCalls)) {
        for (const call of s.toolCalls) pushCall(call);
      }
    }
  }

  // Deduplicate consecutive duplicates from overlapping fields, keep order.
  const out: string[] = [];
  for (const n of collected) {
    if (out[out.length - 1] === n) continue;
    out.push(n);
  }
  return out;
}
