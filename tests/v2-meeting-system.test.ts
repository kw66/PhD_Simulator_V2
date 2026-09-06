import { describe, expect, it } from "vitest";

import { getMeetingSelfPayDiscount, hasFullGear } from "../src/core/v2-meeting-system";
import { createShopState } from "../src/core/v2-shop-items";

describe("v2 meeting system", () => {
  it("derives full gear activation from low-coupling shop and support state", () => {
    expect(hasFullGear(
      { ...createShopState(), ebikeOwned: true },
      {
        hasParasol: true,
        hasDownJacket: true,
        hasBadmintonRacket: false,
        hasStrongBodyTalent: false,
      },
    )).toBe(true);
  });

  it("grows self-pay discount with attended meetings and caps at half", () => {
    expect(getMeetingSelfPayDiscount(0, 6)).toBe(0);
    expect(getMeetingSelfPayDiscount(3, 6)).toBe(0);
    expect(getMeetingSelfPayDiscount(4, 6)).toBe(1);
    expect(getMeetingSelfPayDiscount(16, 6)).toBe(3);
    expect(getMeetingSelfPayDiscount(40, 6)).toBe(3);
  });
});
