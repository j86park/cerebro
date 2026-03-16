import { describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/vaults/route";

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
        }
      ]),
    }
  }
}));

describe("Vaults API GET endpoint", () => {
  it("returns frontend.mdc compliant shape { data: [...] }", async () => {
    const res = await GET();
    const json = await res.json();
    
    // According to frontend.mdc route handlers must return { data: T }
    expect(json).toHaveProperty("data");
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.data[0].id).toBe("CLT-001");
    
    // Must not return the old { clients: [...] }
    expect(json).not.toHaveProperty("clients");
  });
});
