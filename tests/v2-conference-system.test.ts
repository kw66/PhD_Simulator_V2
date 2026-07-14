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

  it("applies full gear discount only to self-pay", () => {
    const input = {
      region: "west" as const,
      favor: 12,
      social: 12,
      shopState: { ...createShopState(), bikeUpgrade: "ebike" as const },
      eventSupport: {
        hasGameController: false,
        hasParasol: true,
        hasDownJacket: true,
        hasBadmintonRacket: false,
        hasStrongBodyTalent: false,
        hasFinanceTalent: false,
      },
      eventCounters: { ...createEventCounters(), meetingCount: 4 },
    };

    const selfPay = resolveConferenceDecisionCost({ ...input, mode: "self" });
    const advisor = resolveConferenceDecisionCost({ ...input, mode: "advisor" }, () => 0.99);

    expect(selfPay.baseCost).toBe(6);
    expect(selfPay.fullGearDiscount).toBe(3);
    expect(selfPay.actualCost).toBe(3);
    expect(advisor.baseCost).toBe(3);
    expect(advisor.fullGearDiscount).toBe(0);
  });

  it("uses tier resist for advisor and proxy, and proxy does not count as attendance", () => {
    const input = {
      region: "asia" as const,
      favor: 12,
      social: 12,
      shopState: createShopState(),
      eventSupport: {
        hasGameController: false,
        hasParasol: false,
        hasDownJacket: false,
        hasBadmintonRacket: false,
        hasStrongBodyTalent: false,
        hasFinanceTalent: false,
      },
      eventCounters: { ...createEventCounters(), meetingCount: 7 },
    };

    const advisor = resolveConferenceDecisionCost({ ...input, mode: "advisor" }, () => 0.99);
    const proxy = resolveConferenceDecisionCost({ ...input, mode: "proxy" }, () => 0.0);

    expect(advisor.resource).toBe("favor");
    expect(advisor.actualCost).toBe(2);
    expect(advisor.countsAsMeeting).toBe(true);

    expect(proxy.resource).toBe("money");
    expect(proxy.actualCost).toBe(0);
    expect(proxy.countsAsMeeting).toBe(false);
  });

  it("keeps domestic proxy free", () => {
    const proxy = resolveConferenceDecisionCost({
      mode: "proxy",
      region: "domestic",
      favor: 0,
      social: 0,
      shopState: createShopState(),
      eventSupport: {
        hasGameController: false,
        hasParasol: false,
        hasDownJacket: false,
        hasBadmintonRacket: false,
        hasStrongBodyTalent: false,
        hasFinanceTalent: false,
      },
      eventCounters: createEventCounters(),
    });

    expect(proxy.baseCost).toBe(0);
    expect(proxy.actualCost).toBe(0);
    expect(proxy.countsAsMeeting).toBe(false);
  });
});