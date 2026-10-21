import { describe, expect, it } from "vitest";
import { formatAttribute, formatAttributeDetail, roundAttribute } from "../src/core/v2-attribute-format";
import { formatEventSanChange, formatTierResistedOutcome } from "../src/core/v2-sanity-rules";
import { describeTalentChange } from "../src/core/v2-talent-history";
import { withGameplayRuleset } from "../src/core/v2-rule-context";

describe("attribute display precision", () => {
  it("preserves historical settlement text during replay while new records keep tiny changes", () => {
    const describe = () => [describeTalentChange("科研", 5.999, 6.003),
      formatEventSanChange(-0.004), formatTierResistedOutcome("科研", 0.004, { effectiveChange: 0.004, resistedCount: 0 })];
    expect(describe()).toEqual(["科研 +0.004（5.999→6.003）", "SAN -0.004", "科研 +0.004"]);
    expect(withGameplayRuleset("20261020-r12", describe)).toEqual(["科研 +0（6→6）", "SAN -0", "科研 +0"]);
  });
  it("uses compact values without changing stored precision or money formatting", async () => {
    expect(formatAttribute(8.672)).toBe("8.7");
    expect(formatAttributeDetail(8.672)).toBe("8.67");
    expect(formatAttribute(8)).toBe("8");
    expect(formatAttributeDetail(8.5)).toBe("8.5");
    expect(formatAttributeDetail(0.295)).toBe("0.3");
    expect(formatAttributeDetail(-0.295)).toBe("-0.3");
    expect(roundAttribute(0.7 - 0.6 - 0.1)).toBe(0);
    const { formatMoney } = await import("../src/core/v2-money");
    expect(formatMoney(0.05)).toBe("0.05");
  });

  it.each([0, 2, 3, 5, 6, 12, 18, 20])("does not display a value on the wrong side of threshold %s", threshold => {
    for (const offset of [-0.04, -0.004, -0.00004, 0.00004, 0.004, 0.04]) {
      const value = roundAttribute(threshold + offset);
      for (const formatter of [formatAttribute, formatAttributeDetail]) {
        expect(Math.sign(Number(formatter(value)) - threshold)).toBe(Math.sign(value - threshold));
      }
    }
  });

  it("keeps fractional caps and tiny changes meaningful", () => {
    expect(formatAttribute(8.24, [8.25])).toBe("8.2");
    expect(formatAttribute(8.249, [8.25])).toBe("8.2");
    expect(formatAttribute(8.251, [8.25])).toBe("8.3");
    expect(formatAttributeDetail(-0.0001)).toBe("-0.0001");
    expect(formatAttribute(0.0000000001)).toBe("0.0000000001");
    expect(formatAttribute(-0)).toBe("0");
    expect(formatAttribute(Number.NaN)).toBe("—");
  });
});
