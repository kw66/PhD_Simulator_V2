import { describe, expect, it } from "vitest";
import { applySanCostModifiers, applyTierResist, getActualSanChange, getMonthlySeasonSanModifier, getSeasonByMonth, getSeasonSanModifier } from "../src/core/v2-sanity-rules";

describe("v2 sanity rules", () => {
  it("maps game months to the confirmed legacy seasons", () => {
    expect(getSeasonByMonth(1)).toBe("autumn");
    expect(getSeasonByMonth(4)).toBe("winter");
    expect(getSeasonByMonth(7)).toBe("spring");
    expect(getSeasonByMonth(10)).toBe("summer");
  });

  it("applies only the confirmed seasonal SAN modifiers", () => {
    expect(getSeasonSanModifier(8, { hasParasol: false })).toBe(1);
    expect(getSeasonSanModifier(11, { hasParasol: false })).toBe(-1);
    expect(getSeasonSanModifier(11, { hasParasol: true })).toBe(0);
    expect(getSeasonSanModifier(2, { hasParasol: false })).toBe(0);
  });

  it("never turns a SAN cost into a positive gain after seasonal adjustment", () => {
    expect(applySanCostModifiers(-1, 8, { hasParasol: false })).toBe(0);
    expect(applySanCostModifiers(-4, 8, { hasParasol: false })).toBe(-3);
    expect(getActualSanChange(-5, 11, { hasParasol: false })).toBe(-6);
  });

  it("applies the confirmed monthly autumn and winter SAN adjustments", () => {
    expect(getMonthlySeasonSanModifier(2, { hasDownJacket: false })).toBe(1);
    expect(getMonthlySeasonSanModifier(5, { hasDownJacket: false })).toBe(-1);
    expect(getMonthlySeasonSanModifier(5, { hasDownJacket: true })).toBe(0);
    expect(getMonthlySeasonSanModifier(8, { hasDownJacket: false })).toBe(0);
  });

  it("applies tier resist point by point using the confirmed thresholds", () => {
    expect(applyTierResist(-4, 18, () => 0)).toEqual({ effectiveChange: 0, resistedCount: 4 });
    expect(applyTierResist(-4, 18, () => 0.99)).toEqual({ effectiveChange: -4, resistedCount: 0 });
  });
});
