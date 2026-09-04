import { describe, expect, it } from "vitest";

import {
  applyMultipliersThenAdditions,
  combineEffectMultipliers,
} from "../src/core/v2-numeric-modifiers";

describe("shared numeric modifier order", () => {
  it("combines multiplier offsets linearly with a zero floor", () => {
    expect(combineEffectMultipliers([1.5, 1.5])).toBe(2);
    expect(combineEffectMultipliers([0.5, 0.5])).toBe(0);
    expect(combineEffectMultipliers([2, 0.5])).toBe(1.5);
  });

  it("applies all multipliers before fixed additions", () => {
    expect(applyMultipliersThenAdditions(2, [2], [-1, -1], "ceil")).toBe(2);
    expect(applyMultipliersThenAdditions(10, [0.5], [5], "round")).toBe(10);
  });
});
