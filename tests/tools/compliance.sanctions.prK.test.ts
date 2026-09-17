import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { VaultService } from "@/lib/db/vault-service";
import { buildCheckSanctionsStatus } from "@/tools/compliance/checkSanctionsStatus";
import { buildComplianceTools } from "@/tools/compliance";
import { COMPLIANCE_TOOL_ALLOWLIST } from "@/lib/policy/toolAllowlists";

function setEnv(overrides: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

describe("T2.4 sanctions check adapter seam", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it("dry-run adapter never claims vendor clearance", async () => {
    setEnv({
      SANCTIONS_CHECK_PROVIDER: "dry-run",
      DRY_RUN: "true",
      DEMO_DATE: "2026-03-14T00:00:00.000Z",
    });

    const { getSanctionsCheckAdapter } = await import("@/lib/sanctions");
    const adapter = getSanctionsCheckAdapter();
    const result = await adapter.check({
      subjectName: "Ada Lovelace",
      hitId: "hit-1",
    });

    expect(result.provider).toBe("dry-run");
    expect(result.status).toBe("dry_run_skipped");
    expect(result.vendorClearanceClaimed).toBe(false);
    expect(result.hitId).toBe("hit-1");
  });

  it("alloy stub skips under DRY_RUN and throws when live", async () => {
    setEnv({
      SANCTIONS_CHECK_PROVIDER: "alloy",
      DRY_RUN: "true",
      DEMO_DATE: "2026-03-14T00:00:00.000Z",
    });

    const { getSanctionsCheckAdapter } = await import("@/lib/sanctions");
    const dry = await getSanctionsCheckAdapter().check({
      subjectName: "Ada Lovelace",
    });
    expect(dry.status).toBe("dry_run_skipped");
    expect(dry.vendorClearanceClaimed).toBe(false);

    vi.resetModules();
    setEnv({
      SANCTIONS_CHECK_PROVIDER: "alloy",
      DRY_RUN: "false",
      DEMO_DATE: "2026-03-14T00:00:00.000Z",
      NODE_ENV: "development",
    });
    const { getSanctionsCheckAdapter: getLive } = await import(
      "@/lib/sanctions"
    );
    await expect(
      getLive().check({ subjectName: "Ada Lovelace" }),
    ).rejects.toThrow(/not configured/);
  });
});

describe("checkSanctionsStatus tool", () => {
  it("routes through VaultService and never claims clearance", async () => {
    const vault = new VaultService({ clientId: "CLT-020" }, {} as never);
    vault.getClientProfile = vi.fn().mockResolvedValue({
      name: "Ada Lovelace",
    });
    vault.checkSanctionsPep = vi.fn().mockResolvedValue({
      provider: "dry-run",
      status: "dry_run_skipped",
      vendorClearanceClaimed: false,
      hitId: "vendor-hit-1",
      subjectName: "Ada Lovelace",
      checkedAt: "2026-03-14T00:00:00.000Z",
      adapterNotes: ["stub"],
    });

    const tool = buildCheckSanctionsStatus(vault);
    const out = await (
      tool as unknown as {
        execute: (input: {
          hitId?: string;
          reason?: string;
        }) => Promise<{
          vendorClearanceClaimed: boolean;
          guidance: string;
        }>;
      }
    ).execute({ hitId: "vendor-hit-1", reason: "EVENT_SANCTIONS_PEP" });

    expect(vault.checkSanctionsPep).toHaveBeenCalledWith({
      subjectName: "Ada Lovelace",
      hitId: "vendor-hit-1",
      reason: "EVENT_SANCTIONS_PEP",
    });
    expect(out.vendorClearanceClaimed).toBe(false);
    expect(out.guidance).toMatch(/Adapter seam/);
  });

  it("includes checkSanctionsStatus on compliance allowlist builder", () => {
    const vault = new VaultService({ clientId: "CLT-001" }, {} as never);
    const keys = Object.keys(buildComplianceTools(vault));
    expect(keys).toContain("checkSanctionsStatus");
    expect([...COMPLIANCE_TOOL_ALLOWLIST]).toContain("checkSanctionsStatus");
  });
});
