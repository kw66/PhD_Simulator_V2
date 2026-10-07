import { describe, expect, it, vi } from "vitest";
import { generateRelationshipResearch } from "../src/core/v2-relationship-research";

describe("relationship initial research", () => {
  it.each([0, 1, 2, 3, 4, 5, 6])("generates year %s from zero with an individual offset", (year) => {
    for (const offset of [0, 1, 2, 3]) {
      const random = vi.fn().mockReturnValueOnce(offset / 4).mockReturnValue(0.99);
      expect(generateRelationshipResearch(year, random)).toBe(year * 2 + offset);
    }
  });

  it("never resists below six, but resists later points within the same initialization", () => {
    expect(generateRelationshipResearch(2, () => 0)).toBe(4);
    expect(generateRelationshipResearch(4, () => 0)).toBe(6);
    const mixed = vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(0.99).mockReturnValue(0);
    expect(generateRelationshipResearch(4, mixed)).toBe(7);
  });

  it("resists individual and smart bonuses together with the base value", () => {
    const individual = vi.fn().mockReturnValueOnce(0.99).mockReturnValue(0);
    expect(generateRelationshipResearch(2, individual)).toBe(6);
    expect(generateRelationshipResearch(1, () => 0, 4)).toBe(6);
    expect(generateRelationshipResearch(6, () => 0, 4)).toBe(6);
  });

  it("rereads resistance after crossing twelve and eighteen", () => {
    expect(generateRelationshipResearch(6, () => 0.3, 4)).toBe(12);
    expect(generateRelationshipResearch(6, () => 0.6, 6)).toBe(18);
    expect(generateRelationshipResearch(6, () => 0.99, 20)).toBe(20);
  });
});
