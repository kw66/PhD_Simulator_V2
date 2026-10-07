import { describe, expect, it } from "vitest";

import { getConferenceBaseCosts, resolveConferenceDecisionCost } from "../src/core/v2-conference-system";
import { createEventCounters } from "../src/core/v2-event-counters";
import { createShopState } from "../src/core/v2-shop-items";

describe("v2 conference system", () => {
  it("matches old region base costs", () => {
    expect(getConferenceBaseCosts("domestic")).toEqual({ selfPay: 2, advisorCost: 1, proxyCost: 0 });
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
    expect(resistedAdvisor.fundingCost).toBe(6);

    expect(proxy.resource).toBe("money");
    expect(proxy.actualCost).toBe(2);
    expect(proxy.resistanceNarrative).toBeUndefined();
    expect(proxy.countsAsMeeting).toBe(false);
  });

  it("charges domestic proxy registration without a service fee", () => {
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
});
