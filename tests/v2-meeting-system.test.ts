import { describe, expect, it } from "vitest";

import { createEventCounters } from "../src/core/v2-event-counters";
import { getFullGearMeetingDiscount, hasFullGear, incrementMeetingCount } from "../src/core/v2-meeting-system";
import { createShopState } from "../src/core/v2-shop-items";

describe("v2 meeting system", () => {
  it("derives full gear activation from low-coupling shop and support state", () => {
    expect(hasFullGear(
      { ...createShopState(), bikeUpgrade: "ebike" },
      {
        hasGameController: false,
        hasParasol: true,
        hasDownJacket: true,
        hasBadmintonRacket: false,
        hasStrongBodyTalent: false,
        hasFinanceTalent: false,
      },
    )).toBe(true);
  });

  it("matches old full gear self-pay discount growth", () => {
    const shopState = { ...createShopState(), bikeUpgrade: "ebike" as const };
    const eventSupport = {
      hasGameController: false,
      hasParasol: true,
      hasDownJacket: true,
      hasBadmintonRacket: false,
      hasStrongBodyTalent: false,
      hasFinanceTalent: false,
    };

    expect(getFullGearMeetingDiscount(0, shopState, eventSupport)).toBe(2);
    expect(getFullGearMeetingDiscount(3, shopState, eventSupport)).toBe(2);
    expect(getFullGearMeetingDiscount(4, shopState, eventSupport)).toBe(3);
    expect(getFullGearMeetingDiscount(16, shopState, eventSupport)).toBe(6);
    expect(getFullGearMeetingDiscount(40, shopState, eventSupport)).toBe(6);
  });

  it("increments meetingCount without touching unrelated event counters", () => {
    const nextCounters = incrementMeetingCount({
      ...createEventCounters(),
      badmintonCount: 1,
      pokerWinCount: 2,
      pokerTotalEarnings: 8,
      ktvCount: 1,
      dinnerCount: 3,
      meetingCount: 5,
      projectCompletedCount: 2,
    });

    expect(nextCounters.meetingCount).toBe(6);
    expect(nextCounters.projectCompletedCount).toBe(2);
    expect(nextCounters.badmintonCount).toBe(1);
    expect(nextCounters.teaBreakCount).toBe(0);
    expect(nextCounters.tourCount).toBe(0);
  });
});