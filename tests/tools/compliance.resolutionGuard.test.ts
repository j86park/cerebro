import { describe, expect, it, vi } from "vitest";
import { VaultService } from "@/lib/db/vault-service";
import { buildMarkResolved } from "@/tools/compliance/markResolved";
import { buildUpdateDocumentStatus } from "@/tools/compliance/updateDocumentStatus";

function vaultFor(document: { status: string; uploadedAt: Date | null; expiryDate: Date | null }) {
  const vault = new VaultService({ clientId: "synthetic-client", now: new Date("2026-09-29T12:00:00.000Z") }, {} as never);
  vault.checkActionCooldown = vi.fn().mockResolvedValue(undefined);
  vault.getDocumentById = vi.fn().mockResolvedValue({ id: "synthetic-id", type: "GOVERNMENT_ID", ...document });
  vault.updateDocumentStatus = vi.fn().mockResolvedValue({});
  vault.logAction = vi.fn().mockResolvedValue({ id: "action" });
  return vault;
}

const reasoning = "A newly uploaded current government ID resolves the expired-document issue.";

describe("compliance resolution admission", () => {
  it("rejects an expired upload through both VALID write paths", async () => {
    const vault = vaultFor({ status: "PENDING_REVIEW", uploadedAt: new Date("2026-09-29T10:00:00.000Z"),
      expiryDate: new Date("2025-01-01T00:00:00.000Z") });
    const mark = buildMarkResolved(vault) as unknown as { execute(input: object): Promise<unknown> };
    const update = buildUpdateDocumentStatus(vault) as unknown as { execute(input: object): Promise<unknown> };
    await expect(mark.execute({ documentId: "synthetic-id", reasoning })).rejects.toThrow(/EXPIRED/);
    await expect(update.execute({ documentId: "synthetic-id", status: "VALID", reasoning })).rejects.toThrow(/EXPIRED/);
    expect(vault.updateDocumentStatus).not.toHaveBeenCalled();
    expect(vault.logAction).not.toHaveBeenCalled();
  });

  it("rejects an unchanged EXPIRED record without a replacement upload", async () => {
    const vault = vaultFor({ status: "EXPIRED", uploadedAt: null,
      expiryDate: new Date("2027-01-01T00:00:00.000Z") });
    const mark = buildMarkResolved(vault) as unknown as { execute(input: object): Promise<unknown> };
    await expect(mark.execute({ documentId: "synthetic-id", reasoning })).rejects.toThrow(/PENDING_REVIEW/);
    expect(vault.updateDocumentStatus).not.toHaveBeenCalled();
  });

  it("admits a current replacement upload through the resolve path", async () => {
    const vault = vaultFor({ status: "PENDING_REVIEW", uploadedAt: new Date("2026-09-29T10:00:00.000Z"),
      expiryDate: new Date("2027-09-29T00:00:00.000Z") });
    const mark = buildMarkResolved(vault) as unknown as { execute(input: object): Promise<unknown> };
    expect(await mark.execute({ documentId: "synthetic-id", reasoning })).toMatchObject({ success: true, newStatus: "VALID" });
    expect(vault.updateDocumentStatus).toHaveBeenCalledWith("synthetic-id", "VALID", undefined);
    expect(vault.logAction).toHaveBeenCalledWith(expect.objectContaining({ actionType: "MARK_RESOLVED" }));
  });
});
