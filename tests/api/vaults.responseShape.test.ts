import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as GETVaults } from "@/app/api/vaults/route";
import { GET as GETVaultDetail } from "@/app/api/vaults/[clientId]/route";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    client: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "CLT-001",
          name: "Test Client",
          advisor: { name: "Tom" },
          firm: { name: "Firm" },
          documents: [],
          _count: { documents: 0 },
        },
      ]),
    },
  },
}));

const vaultExists = vi.fn().mockResolvedValue(true);
const getClientProfile = vi.fn().mockResolvedValue({ id: "CLT-001", name: "X" });
const getDocuments = vi.fn().mockResolvedValue([]);
const getActionHistory = vi.fn().mockResolvedValue([]);

vi.mock("@/lib/db/vault-service", () => ({
  VaultService: class {
    constructor(_ctx: { clientId: string }) {}
    vaultExists = vaultExists;
    getClientProfile = getClientProfile;
    getDocuments = getDocuments;
    getActionHistory = getActionHistory;
  },
}));

describe("Vaults API GET endpoint", () => {
  it("returns frontend.mdc compliant shape { data: [...] }", async () => {
    const res = await GETVaults();
    const json = await res.json();

    expect(json).toHaveProperty("data");
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.data[0].id).toBe("CLT-001");

    expect(json).not.toHaveProperty("clients");
  });
});

describe("GET /api/vaults/[clientId]", () => {
  it("returns aggregate vault payload under data", async () => {
    const res = await GETVaultDetail(new NextRequest("http://x"), {
      params: Promise.resolve({ clientId: "CLT-001" }),
    });
    const json = await res.json();
    expect(json.data).toMatchObject({
      profile: expect.anything(),
      documents: [],
      actions: [],
    });
  });
});
