import { describe, expect, it } from "vitest";
import {
  applySanCostModifiers,
  applyTierResist,
  getActualResearchMiscSanChange,
  getActualSanChange,
  getMonthlySeasonSanModifier,
  formatResearchMiscSanChange,
  getResearchMiscSanChange,
  getSeasonByMonth,
  getSeasonSanModifier,
  getTierResistedNarrative,
  getTierResistChance,
  formatTierResistedOutcome,
} from "../src/core/v2-sanity-rules";

describe("v2 sanity rules", () => {
  it("maps game months to the confirmed seasons", () => {
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

  it("applies autumn and winter month-start SAN effects", () => {
    expect(getMonthlySeasonSanModifier(2, { hasDownJacket: false })).toBe(1);
    expect(getMonthlySeasonSanModifier(5, { hasDownJacket: false })).toBe(-1);
    expect(getMonthlySeasonSanModifier(5, { hasDownJacket: true })).toBe(0);
    expect(getMonthlySeasonSanModifier(8, { hasDownJacket: false })).toBe(0);
    expect(getMonthlySeasonSanModifier(11, { hasDownJacket: false })).toBe(0);
  });

  it("never turns a SAN cost into a positive gain after seasonal adjustment", () => {
    expect(applySanCostModifiers(-1, 8, { hasParasol: false })).toBe(0);
    expect(applySanCostModifiers(-4, 8, { hasParasol: false })).toBe(-3);
    expect(getActualSanChange(-5, 11, { hasParasol: false })).toBe(-6);
  });

  it("shows only the final SAN change and its research-tier discount", () => {
    expect(formatResearchMiscSanChange(-4, 1, 5, { hasParasol: false }))
      .toBe("SAN -4");
    expect(formatResearchMiscSanChange(-4, 6, 5, { hasParasol: false }))
      .toBe("SAN -3（减免1）");
    expect(formatResearchMiscSanChange(-4, 6, 10, { hasParasol: false }))
      .toBe("SAN -4（减免1）");
  });

  it("uses fixed tier discounts and allows research chores to reach zero SAN", () => {
    expect([1, 6, 12, 18].map((research) => getResearchMiscSanChange(-8, research)))
      .toEqual([-8, -7, -6, -5]);
    expect([1, 6, 12, 18].map((research) => getResearchMiscSanChange(-2, research)))
      .toEqual([-2, -1, 0, 0]);
    expect(getActualResearchMiscSanChange(-2, 18, 8, { hasParasol: false })).toBe(0);
    expect(getActualResearchMiscSanChange(-2, 18, 10, { hasParasol: false })).toBe(-1);
  });

  it("applies tier resist point by point using the confirmed thresholds", () => {
    expect([0, 6, 12, 18].map(getTierResistChance)).toEqual([0, 0.25, 0.5, 0.75]);
    expect(applyTierResist(-4, 18, () => 0)).toEqual({ effectiveChange: 0, resistedCount: 4 });
    expect(applyTierResist(-4, 18, () => 0.99)).toEqual({ effectiveChange: -4, resistedCount: 0 });
  });

  it("resolves every point of a two-point favor gain independently", () => {
    const resolve = (rolls: number[]) => {
      let index = 0;
      return applyTierResist(2, 12, () => rolls[index++] ?? 0);
    };

    const fullyResisted = resolve([0, 0]);
    const partlyResisted = resolve([0, 0.99]);
    const fullyApplied = resolve([0.99, 0.99]);

    expect(fullyResisted).toEqual({ effectiveChange: 0, resistedCount: 2 });
    expect(partlyResisted).toEqual({ effectiveChange: 1, resistedCount: 1 });
    expect(fullyApplied).toEqual({ effectiveChange: 2, resistedCount: 0 });
    expect(getTierResistedNarrative("导师好感", 2, fullyResisted)).toContain("没那么容易");
    expect(getTierResistedNarrative("导师好感", 2, partlyResisted)).toContain("拉近了一点");
    expect(getTierResistedNarrative("导师好感", 2, fullyApplied)).toBe("");
  });

  it("formats resisted outcomes as compact final values", () => {
    expect(formatTierResistedOutcome("科研", 1, { effectiveChange: 0, resistedCount: 1 })).toBe("科研+0（抵抗1）");
    expect(formatTierResistedOutcome("科研", 1, { effectiveChange: 1, resistedCount: 0 })).toBe("科研+1");
    expect(formatTierResistedOutcome("导师好感", -1, { effectiveChange: -1, resistedCount: 0 })).toBe("导师好感-1");
    expect(formatTierResistedOutcome("科研", 1, { effectiveChange: 0, resistedCount: 0, cappedCount: 1 })).toBe("科研+0（上限）");
  });
});
