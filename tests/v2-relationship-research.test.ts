import { describe, expect, it, vi } from "vitest";
import { generateRelationshipResearch } from "../src/core/v2-relationship-research";

describe("relationship initial research", () => {
  it.each([
    [0, [0, 1, 2, 3]],
    [1, [2, 3, 4, 5]],
    [2, [4, 5, 6, 6.8]],
    [3, [6, 6.8, 7.6, 8.4]],
    [4, [7.6, 8.4, 9.2, 10]],
    [5, [9.2, 10, 10.8, 11.6]],
    [6, [10.8, 11.6, 12.4, 13]],
  ] as const)("generates year %s from zero with an individual offset", (year, expected) => {
    for (const offset of [0, 1, 2, 3]) {
      const random = vi.fn().mockReturnValueOnce(offset / 4).mockReturnValue(0.99);
      expect(generateRelationshipResearch(year, random)).toBe(expected[offset]);
      expect(random).toHaveBeenCalledTimes(1);
    }
  });

  it("never resists below six, but resists later points within the same initialization", () => {
    expect(generateRelationshipResearch(2, () => 0)).toBe(4);
    expect(generateRelationshipResearch(4, () => 0)).toBe(7.6);
    const mixed = vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(0.99).mockReturnValue(0);
    expect(generateRelationshipResearch(4, mixed)).toBe(7.6);
    expect(mixed).toHaveBeenCalledTimes(1);
  });

  it("resists individual and smart bonuses together with the base value", () => {
    const individual = vi.fn().mockReturnValueOnce(0.99).mockReturnValue(0);
    expect(generateRelationshipResearch(2, individual)).toBe(6.8);
    expect(generateRelationshipResearch(1, () => 0, 4)).toBe(6);
    expect(generateRelationshipResearch(6, () => 0, 4)).toBe(13.6);
  });

  it("rereads resistance after crossing twelve and eighteen", () => {
    expect(generateRelationshipResearch(6, () => 0.3, 4)).toBe(14.2);
    expect(generateRelationshipResearch(6, () => 0.6, 6)).toBe(16);
    expect(generateRelationshipResearch(6, () => 0, 16)).toBe(20);
    expect(generateRelationshipResearch(6, () => 0.99, 20)).toBe(20);
  });
});
