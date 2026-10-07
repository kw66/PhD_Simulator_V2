import { describe, expect, it } from "vitest";

import { getMeetingSelfPayDiscount, getRegionalMeetingDiscount, hasFullGear } from "../src/core/v2-meeting-system";
import { getMeetingExperienceDiscount } from "../src/core/v2-growth-system";
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

  it("never discounts fees through any meeting experience entry point", () => {
    expect(getMeetingSelfPayDiscount(0, 6)).toBe(0);
    expect(getMeetingSelfPayDiscount(3, 6)).toBe(0);
    expect(getMeetingSelfPayDiscount(4, 6)).toBe(0);
    expect(getMeetingSelfPayDiscount(16, 6)).toBe(0);
    expect(getMeetingSelfPayDiscount(40, 6)).toBe(0);
    expect(getMeetingExperienceDiscount(40, 6)).toBe(0);
    for (const region of ["domestic", "asia", "west"] as const) {
      expect(getRegionalMeetingDiscount({ domesticMeetingCount: 40, asiaMeetingCount: 40, westMeetingCount: 40 }, region, 6)).toBe(0);
    }
  });
});
