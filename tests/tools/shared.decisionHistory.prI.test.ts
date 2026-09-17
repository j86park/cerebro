import { describe, expect, it, vi } from "vitest";
import { VaultService } from "@/lib/db/vault-service";
import { buildGetDecisionHistory } from "@/tools/shared/getDecisionHistory";
import { buildSharedTools } from "@/tools/shared";

vi.mock("@/lib/config", () => ({
  env: {
    DRY_RUN: true,
    DEMO_DATE: "2026-03-14T00:00:00.000Z",
    TOOL_POLICY_VERSION: "tool-policy-v1",
  },
}));

function stubVault(): VaultService {
  return new VaultService({ clientId: "CLT-123" }, {} as never);
}

describe("getDecisionHistory", () => {
  it("maps DecisionRecords newest-first without metadata payloads", async () => {
    const vault = stubVault();
    vault.getDecisionHistory = vi.fn().mockResolvedValue([
      {
        id: "dec-1",
        jobId: "job-a",
        agentName: "complianceAgent",
        stage: 1,
        traceId: "abc123",
        policyVersion: "tool-policy-v1",
        policyFired: null,
        toolProposed: ["getDocumentComplianceStatus"],
        toolExecuted: ["getDocumentComplianceStatus"],
        refusalCodes: [],
        reviewer: null,
        outcome: "RUN_STARTED",
        reason: "Worker started",
        promptVersionId: "pv-1",
        contentCaptured: false,
        metadata: { secret: "omit-me" },
        decidedAt: new Date("2026-03-10T00:00:00.000Z"),
      },
      {
        id: "dec-2",
        jobId: "job-a",
        agentName: "complianceAgent",
        stage: 1,
        traceId: "abc123",
        policyVersion: "tool-policy-v1",
        policyFired: null,
        toolProposed: [],
        toolExecuted: ["sendAdvisorAlert"],
        refusalCodes: [],
        reviewer: null,
        outcome: "DRY_RUN",
        reason: "Completed under DRY_RUN",
        promptVersionId: "pv-1",
        contentCaptured: false,
        decidedAt: new Date("2026-03-11T00:00:00.000Z"),
      },
    ]);

    const tool = buildGetDecisionHistory(vault);
    const result = await (
      tool as unknown as {
        execute: (i: {
          limit?: number;
          jobId?: string;
        }) => Promise<{
          total: number;
          decisions: Array<{
            id: string;
            outcome: string;
            decidedAt: string;
            contentCaptured: boolean;
          }>;
        }>;
      }
    ).execute({ limit: 10 });

    expect(vault.getDecisionHistory).toHaveBeenCalledWith(undefined);
    expect(result.total).toBe(2);
    expect(result.decisions.map((d) => d.id)).toEqual(["dec-2", "dec-1"]);
    expect(result.decisions[0]).toMatchObject({
      outcome: "DRY_RUN",
      decidedAt: "2026-03-11T00:00:00.000Z",
      contentCaptured: false,
    });
    expect(result.decisions[0]).not.toHaveProperty("metadata");
  });

  it("forwards optional jobId filter", async () => {
    const vault = stubVault();
    vault.getDecisionHistory = vi.fn().mockResolvedValue([]);

    const tool = buildGetDecisionHistory(vault);
    await (
      tool as unknown as {
        execute: (i: { jobId?: string }) => Promise<unknown>;
      }
    ).execute({ jobId: "job-42" });

    expect(vault.getDecisionHistory).toHaveBeenCalledWith({ jobId: "job-42" });
  });
});

describe("shared toolset allowlist (PR-I)", () => {
  it("includes getDecisionHistory on shared builder", () => {
    const vault = stubVault();
    const keys = Object.keys(buildSharedTools(vault));
    expect(keys).toContain("getDecisionHistory");
  });
});
