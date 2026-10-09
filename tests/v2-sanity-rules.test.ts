import { describe, expect, it, vi } from "vitest";
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
  formatTierResistedChange,
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
    expect([0, 6, 12, 18].map((value) => applyTierResist(1, value))).toEqual([
      { effectiveChange: 1, resistedCount: 0 },
      { effectiveChange: 0.75, resistedCount: 0.25 },
      { effectiveChange: 0.5, resistedCount: 0.5 },
      { effectiveChange: 0.25, resistedCount: 0.75 },
    ]);
    expect([0, 6, 12, 18].map((value) => applyTierResist(-1, value))).toEqual([
      { effectiveChange: -1, resistedCount: 0 },
      { effectiveChange: -0.75, resistedCount: 0.25 },
      { effectiveChange: -0.5, resistedCount: 0.5 },
      { effectiveChange: -0.25, resistedCount: 0.75 },
    ]);
  });

  it("re-reads the tier after every applied point, for gains and losses alike", () => {
    expect(applyTierResist(3, 11)).toEqual({ effectiveChange: 2, resistedCount: 1 });
    expect(applyTierResist(-3, 12)).toEqual({ effectiveChange: -2, resistedCount: 1 });
    expect(applyTierResist(2, 5)).toEqual({ effectiveChange: 1.75, resistedCount: 0.25 });
    expect(applyTierResist(-2, 6)).toEqual({ effectiveChange: -1.75, resistedCount: 0.25 });
    expect(applyTierResist(2, 17.75)).toEqual({ effectiveChange: 0.75, resistedCount: 1.25 });
    expect(applyTierResist(-2, 18)).toEqual({ effectiveChange: -0.75, resistedCount: 1.25 });
    expect(applyTierResist(28, 0)).toEqual({ effectiveChange: 18.5, resistedCount: 9.5 });
    expect(applyTierResist(-28, 18)).toEqual({ effectiveChange: -19.25, resistedCount: 8.75 });
  });

  it("does not consume RNG or vary resistance with the supplied roll", () => {
    for (const roll of [0, 0.3, 0.6, 0.99]) {
      const random = vi.fn(() => roll);
      const result = applyTierResist(2, 12, random);
      expect(result).toEqual({ effectiveChange: 1, resistedCount: 1 });
      expect(applyTierResist(-4, 18, random)).toEqual({ effectiveChange: -1.75, resistedCount: 2.25 });
      expect(getTierResistedNarrative("导师好感", 2, result)).toBe("");
      expect(random).not.toHaveBeenCalled();
    }
    const random = vi.spyOn(Math, "random");
    try {
      expect(applyTierResist(2, 12)).toEqual({ effectiveChange: 1, resistedCount: 1 });
      expect(random).not.toHaveBeenCalled();
    } finally {
      random.mockRestore();
    }
  });

  it("settles fractional raw deltas without rounding them up to whole points", () => {
    expect(applyTierResist(0.5, 0)).toEqual({ effectiveChange: 0.5, resistedCount: 0 });
    expect(applyTierResist(0.5, 6)).toEqual({ effectiveChange: 0.375, resistedCount: 0.125 });
    expect(applyTierResist(-0.5, 12)).toEqual({ effectiveChange: -0.25, resistedCount: 0.25 });
    expect(applyTierResist(0.1, 18)).toEqual({ effectiveChange: 0.025, resistedCount: 0.075 });
    expect(applyTierResist(1.5, 5)).toEqual({ effectiveChange: 1.375, resistedCount: 0.125 });
    expect(applyTierResist(-1.5, 6)).toEqual({ effectiveChange: -1.25, resistedCount: 0.25 });
    expect(applyTierResist(0, 12)).toEqual({ effectiveChange: 0, resistedCount: 0 });
  });

  it("fills fractional cap room and reports only the discarded retained amount as capped", () => {
    expect(applyTierResist(3, 7, undefined, 8)).toEqual({ effectiveChange: 1, resistedCount: 0.75, cappedCount: 1.25 });
    expect(applyTierResist(1, 19.9)).toEqual({ effectiveChange: 0.1, resistedCount: 0.75, cappedCount: 0.15 });
    expect(applyTierResist(1, 20)).toEqual({ effectiveChange: 0, resistedCount: 0.75, cappedCount: 0.25 });
    expect(applyTierResist(1, 21)).toEqual({ effectiveChange: 0, resistedCount: 0.75, cappedCount: 0.25 });
    expect(applyTierResist(-1, 21)).toEqual({ effectiveChange: -0.25, resistedCount: 0.75 });
    expect(applyTierResist(1, 21.9, undefined, 22)).toEqual({ effectiveChange: 0.1, resistedCount: 0.75, cappedCount: 0.15 });
    expect(applyTierResist(0.5, 19.9)).toEqual({ effectiveChange: 0.1, resistedCount: 0.375, cappedCount: 0.025 });
  });

  it("normalizes floating-point noise without discarding small retained values", () => {
    expect(applyTierResist(0.1 + 0.2, 6)).toEqual({ effectiveChange: 0.225, resistedCount: 0.075 });
    expect(applyTierResist(0.000001, 18)).toEqual({ effectiveChange: 0.00000025, resistedCount: 0.00000075 });
    expect(applyTierResist(3.2, 11.3)).toEqual({ effectiveChange: 1.85, resistedCount: 1.35 });
    expect(applyTierResist(2.1, 5.1, undefined, 6.3)).toEqual({ effectiveChange: 1.2, resistedCount: 0.275, cappedCount: 0.625 });
  });

  it("formats actual changes with resistance amounts separate from caps", () => {
    expect(formatTierResistedOutcome("科研", 1, { effectiveChange: 0, resistedCount: 1 })).toBe("科研 +0（抵抗1）");
    expect(formatTierResistedOutcome("科研", 1, { effectiveChange: 1, resistedCount: 0 })).toBe("科研 +1");
    expect(formatTierResistedOutcome("导师好感", -1, { effectiveChange: -1, resistedCount: 0 })).toBe("导师好感 -1");
    expect(formatTierResistedOutcome("科研", 1, { effectiveChange: 0, resistedCount: 0, cappedCount: 1 })).toBe("科研 +0（上限）");
    expect(formatTierResistedOutcome("科研", 1, applyTierResist(1, 6))).toBe("科研 +0.75（抵抗0.25）");
    expect(formatTierResistedOutcome("社交", -1, applyTierResist(-1, 12))).toBe("社交 -0.5（抵抗0.5）");
    expect(formatTierResistedOutcome("导师好感", -1, applyTierResist(-1, 6))).toBe("导师好感 -0.75（抵抗0.25）");
    expect(formatTierResistedOutcome("导师好感", -2, applyTierResist(-2, 8))).toBe("导师好感 -1.5（抵抗0.5）");
    expect(formatTierResistedOutcome("导师好感", 1, applyTierResist(1, 19.9))).toBe("导师好感 +0.1（抵抗0.75；上限）");
    expect(formatTierResistedChange("科研", 0.5, applyTierResist(0.5, 6))).toBe("科研 +0.38（抵抗0.13）");
    expect(formatTierResistedChange("社交", -1, applyTierResist(-1, 12))).toBe("社交 -0.5（抵抗0.5）");
    expect(formatTierResistedChange("科研", 1, applyTierResist(1, 20))).toBe("科研 +0（抵抗0.75；上限）");
    expect(formatTierResistedOutcome("社交", -1, { effectiveChange: 0, resistedCount: 1 })).toBe("社交 -0（抵抗1）");
  });

  it("limits result and resistance displays to two decimals without float tails", () => {
    const result = { effectiveChange: 0.1 + 0.2, resistedCount: 0.295 };
    expect(formatTierResistedOutcome("科研", 0.595, result)).toBe("科研 +0.3（抵抗0.3）");
    expect(result).toEqual({ effectiveChange: 0.1 + 0.2, resistedCount: 0.295 });
    expect(formatTierResistedOutcome("社交", -0.004, { effectiveChange: -0.004, resistedCount: 0 })).toBe("社交 -0");
  });
});
