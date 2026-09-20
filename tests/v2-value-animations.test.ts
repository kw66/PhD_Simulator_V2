import { describe, expect, it } from "vitest";
import { getVisibleValueDelta } from "../src/app/v2-value-animations";

describe("visible value animations", () => {
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
