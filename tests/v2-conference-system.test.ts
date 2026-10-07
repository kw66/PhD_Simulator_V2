import { describe, expect, it } from "vitest";

import { getConferenceBaseCosts, resolveConferenceDecisionCost } from "../src/core/v2-conference-system";
import { createEventCounters } from "../src/core/v2-event-counters";
import { createShopState } from "../src/core/v2-shop-items";

describe("v2 conference system", () => {
  it("charges regional travel and a fixed stranger proxy fee", () => {
    expect(getConferenceBaseCosts("domestic")).toEqual({ selfPay: 2, advisorCost: 1, proxyCost: 1 });
    expect(getConferenceBaseCosts("asia")).toEqual({ selfPay: 4, advisorCost: 2, proxyCost: 1 });
    expect(getConferenceBaseCosts("west")).toEqual({ selfPay: 6, advisorCost: 3, proxyCost: 1 });
  });

  it("keeps attendance fees fixed regardless of meeting experience", () => {
    const input = {
      region: "west" as const,
      favor: 12,
      social: 12,
      shopState: { ...createShopState(), ebikeOwned: true },
      eventSupport: {
        hasParasol: true,
        hasDownJacket: true,
        hasBadmintonRacket: false,
        hasStrongBodyTalent: false,
      },
      eventCounters: { ...createEventCounters(), meetingCount: 4, westMeetingCount: 3 },
    };

    const selfPay = resolveConferenceDecisionCost({ ...input, mode: "self" });
    const advisor = resolveConferenceDecisionCost({ ...input, mode: "advisor" }, () => 0.99);

    expect(selfPay.meetingDiscount).toBe(0);
    expect(selfPay.actualCost).toBe(6);
    expect(advisor.meetingDiscount).toBe(0);
  });

  it("resists only advisor favor and never applies social resistance to proxy fees", () => {
    const input = {
      region: "asia" as const,
      favor: 12,
      social: 12,
      shopState: createShopState(),
      eventSupport: {
        hasParasol: false,
        hasDownJacket: false,
        hasBadmintonRacket: false,
        hasStrongBodyTalent: false,
      },
      eventCounters: { ...createEventCounters(), meetingCount: 7, asiaMeetingCount: 3 },
    };

    const advisor = resolveConferenceDecisionCost({ ...input, mode: "advisor" }, () => 0.99);
    const proxy = resolveConferenceDecisionCost({ ...input, mode: "proxy" }, () => 0.0);
    const resistedAdvisor = resolveConferenceDecisionCost({ ...input, mode: "advisor", paperCount: 3 }, () => 0);

    expect(advisor.resource).toBe("favor");
    expect(advisor.actualCost).toBe(2);
    expect(advisor.fundingCost).toBe(4);
    expect(advisor.countsAsMeeting).toBe(true);
    expect(resistedAdvisor.actualCost).toBe(0);
    expect(resistedAdvisor.fundingCost).toBe(4);

    expect(proxy.resource).toBe("money");
    expect(proxy.actualCost).toBe(1);
    expect(proxy.resistanceNarrative).toBeUndefined();
    expect(proxy.countsAsMeeting).toBe(false);
  });

  it("charges a domestic stranger proxy without registration", () => {
    const proxy = resolveConferenceDecisionCost({
      mode: "proxy",
      region: "domestic",
      favor: 0,
      social: 0,
      shopState: createShopState(),
      eventSupport: {
        hasParasol: false,
        hasDownJacket: false,
        hasBadmintonRacket: false,
        hasStrongBodyTalent: false,
      },
      eventCounters: createEventCounters(),
    });

    expect(proxy.actualCost).toBe(1);
    expect(proxy.countsAsMeeting).toBe(false);
  });

  it.each(["domestic", "asia", "west"] as const)("ignores paper count and region for a current fellow's proxy in %s", (region) => {
    for (const paperCount of [1, 3, 10]) {
      const input = {
        mode: "proxy" as const, region, paperCount, favor: 12, social: 12,
        shopState: createShopState(), eventCounters: createEventCounters(),
        eventSupport: { hasParasol: false, hasDownJacket: false, hasBadmintonRacket: false, hasStrongBodyTalent: false },
      };
      expect(resolveConferenceDecisionCost({ ...input, hasFellowAtConference: true }).actualCost).toBe(0);
      expect(resolveConferenceDecisionCost({ ...input, hasFellowAtConference: false }).actualCost).toBe(1);
      expect(resolveConferenceDecisionCost({ ...input, hasFellowAtConference: true }).fundingCost).toBe(0);
    }
  });
});
