import { describe, expect, it, vi } from "vitest";
import { generateRelationshipResearch } from "../src/core/v2-relationship-research";

describe("relationship initial research", () => {
  it.each([
    [0, [0, 1, 2, 3]],
    [1, [2, 3, 4, 5]],
    [2, [4, 5, 6, 6.75]],
    [3, [6, 6.75, 7.5, 8.25]],
    [4, [7.5, 8.25, 9, 9.75]],
    [5, [9, 9.75, 10.5, 11.25]],
    [6, [10.5, 11.25, 12, 12.5]],
  ] as const)("generates year %s from zero with an individual offset", (year, expected) => {
    for (const offset of [0, 1, 2, 3]) {
      const random = vi.fn().mockReturnValueOnce(offset / 4).mockReturnValue(0.99);
      expect(generateRelationshipResearch(year, random)).toBe(expected[offset]);
      expect(random).toHaveBeenCalledTimes(1);
    }
  });

  it("never resists below six, but resists later points within the same initialization", () => {
    expect(generateRelationshipResearch(2, () => 0)).toBe(4);
    expect(generateRelationshipResearch(4, () => 0)).toBe(7.5);
    const mixed = vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(0.99).mockReturnValue(0);
    expect(generateRelationshipResearch(4, mixed)).toBe(7.5);
    expect(mixed).toHaveBeenCalledTimes(1);
  });

  it("resists individual and smart bonuses together with the base value", () => {
    const individual = vi.fn().mockReturnValueOnce(0.99).mockReturnValue(0);
    expect(generateRelationshipResearch(2, individual)).toBe(6.75);
    expect(generateRelationshipResearch(1, () => 0, 4)).toBe(6);
    expect(generateRelationshipResearch(6, () => 0, 4)).toBe(13);
  });

  it("rereads resistance after crossing twelve and eighteen", () => {
    expect(generateRelationshipResearch(6, () => 0.3, 4)).toBe(13.5);
    expect(generateRelationshipResearch(6, () => 0.6, 6)).toBe(15);
    expect(generateRelationshipResearch(6, () => 0, 16)).toBe(18.5);
    expect(generateRelationshipResearch(6, () => 0.99, 20)).toBe(20);
  });
});
