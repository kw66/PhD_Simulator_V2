import { describe, expect, it } from "vitest";
import { getVisibleValueDelta } from "../src/app/v2-value-animations";
import { renderAnimatedNumber, renderAnimatedTemplate } from "../src/app/v2-render-animation";

describe("visible value animations", () => {
  it("formats generic progress, balances and multipliers without floating tails", () => {
    expect(renderAnimatedNumber("progress", 12.30000000004)).toContain('>12.3</span>');
    expect(renderAnimatedNumber("money", 1.005)).toContain('>1.01</span>');
    expect(renderAnimatedNumber("noise", -0.0000000004)).toContain('>0</span>');
    expect(renderAnimatedNumber("heat", 1.2, "1.20")).toContain('>1.20</span>');
    expect(renderAnimatedTemplate("paper", "倍率 {heat}", { heat: 1.2500000004 })).toContain('>1.25</span>');
  });
  it("animates increases, decreases and fractional changes on the open page", () => {
    expect(getVisibleValueDelta({ value: 4, visible: true }, { value: 10, visible: true })).toBe(6);
    expect(getVisibleValueDelta({ value: 10, visible: true }, { value: 4, visible: true })).toBe(-6);
    expect(getVisibleValueDelta({ value: 0.1, visible: true }, { value: 0.3, visible: true })).toBe(0.2);
  });

  it("does not animate new cards, newly opened tabs or background updates", () => {
    expect(getVisibleValueDelta(undefined, { value: 10, visible: true })).toBe(0);
    expect(getVisibleValueDelta({ value: 4, visible: false }, { value: 10, visible: true })).toBe(0);
    expect(getVisibleValueDelta({ value: 4, visible: true }, { value: 10, visible: false })).toBe(0);
    expect(getVisibleValueDelta({ value: 4, visible: false }, { value: 10, visible: false })).toBe(0);
  });

  it("uses displayed decimals for deltas and ignores invisible floating-point noise", () => {
    expect(getVisibleValueDelta({ value: 6.8, visible: true }, { value: 7.8000000004, visible: true })).toBe(1);
    expect(getVisibleValueDelta({ value: 7.8, visible: true }, { value: 6.7999999996, visible: true })).toBe(-1);
    expect(getVisibleValueDelta({ value: 6.75, visible: true }, { value: 7.5500000004, visible: true })).toBe(0.8);
    expect(getVisibleValueDelta({ value: 6.8, visible: true }, { value: 6.8000000004, visible: true })).toBe(0);
    expect(getVisibleValueDelta({ value: 6.804, visible: true }, { value: 6.806, visible: true })).toBe(0.01);
  });

  it("does not replay a background change on reopening a page", () => {
    const hiddenUpdate = { value: 10, visible: false };
    const reopened = { value: 10, visible: true };
    expect(getVisibleValueDelta(hiddenUpdate, reopened)).toBe(0);
    expect(getVisibleValueDelta(reopened, { value: 12, visible: true })).toBe(2);
  });

  it("ignores unchanged or invalid numeric values", () => {
    expect(getVisibleValueDelta({ value: 4, visible: true }, { value: 4, visible: true })).toBe(0);
    expect(getVisibleValueDelta({ value: NaN, visible: true }, { value: 4, visible: true })).toBe(0);
    expect(getVisibleValueDelta({ value: 4, visible: true }, { value: Infinity, visible: true })).toBe(0);
  });
});
