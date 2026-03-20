import { describe, expect, it } from "vitest";
import { vaultRowHealthBgClass } from "@/lib/dashboard/vault-health";

describe("vaultRowHealthBgClass", () => {
  it("maps critical / warning / healthy to milestone colors", () => {
    expect(vaultRowHealthBgClass("CRITICAL")).toBe("bg-red-500");
    expect(vaultRowHealthBgClass("HIGH")).toBe("bg-yellow-500");
    expect(vaultRowHealthBgClass("MEDIUM")).toBe("bg-yellow-500");
    expect(vaultRowHealthBgClass("NONE")).toBe("bg-green-500");
  });
});
