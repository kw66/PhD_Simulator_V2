import { applyTierResist } from "./v2-sanity-rules";
import type { EventCounters, EventSupportState, ShopState } from "./v2-types";
import { getFullGearMeetingDiscount } from "./v2-meeting-system";

export type ConferenceRegionId = "domestic" | "asia" | "west";
export type ConferenceDecisionMode = "self" | "advisor" | "proxy";
export type ConferenceCostResource = "money" | "favor";

export interface ConferenceBaseCosts {
  selfPay: number;
  advisorCost: number;
  proxyCost: number;
}

export interface ConferenceDecisionInput {
  mode: ConferenceDecisionMode;
  region: ConferenceRegionId;
  favor: number;
  social: number;
  shopState: ShopState;
  eventSupport: EventSupportState;
  eventCounters: EventCounters;
}

export interface ConferenceDecisionCost {
  mode: ConferenceDecisionMode;
  resource: ConferenceCostResource;
  baseCost: number;
  actualCost: number;
  fullGearDiscount: number;
  countsAsMeeting: boolean;
}

export function getConferenceBaseCosts(region: ConferenceRegionId): ConferenceBaseCosts {
  if (region === "domestic") {
    return { selfPay: 2, advisorCost: 1, proxyCost: 0 };
  }
  if (region === "asia") {
    return { selfPay: 4, advisorCost: 2, proxyCost: 1 };
  }
  return { selfPay: 6, advisorCost: 3, proxyCost: 1 };
}

export function resolveConferenceDecisionCost(
  input: ConferenceDecisionInput,
  getRoll: () => number = Math.random,
): ConferenceDecisionCost {
  const baseCosts = getConferenceBaseCosts(input.region);
  const fullGearDiscount = getFullGearMeetingDiscount(
    input.eventCounters.meetingCount,
    input.shopState,
    input.eventSupport,
  );

  if (input.mode === "self") {
    return {
      mode: input.mode,
      resource: "money",
      baseCost: baseCosts.selfPay,
      actualCost: Math.max(0, baseCosts.selfPay - fullGearDiscount),
      fullGearDiscount,
      countsAsMeeting: true,
    };
  }

  if (input.mode === "advisor") {
    const actualCost = Math.max(0, -applyTierResist(-baseCosts.advisorCost, input.favor, getRoll).effectiveChange);
    return {
      mode: input.mode,
      resource: "favor",
      baseCost: baseCosts.advisorCost,
      actualCost,
      fullGearDiscount: 0,
      countsAsMeeting: true,
    };
  }

  if (baseCosts.proxyCost === 0) {
    return {
      mode: input.mode,
      resource: "money",
      baseCost: 0,
      actualCost: 0,
      fullGearDiscount: 0,
      countsAsMeeting: false,
    };
  }

  const actualCost = Math.max(0, -applyTierResist(-baseCosts.proxyCost, input.social, getRoll).effectiveChange);
  return {
    mode: input.mode,
    resource: "money",
    baseCost: baseCosts.proxyCost,
    actualCost,
    fullGearDiscount: 0,
    countsAsMeeting: false,
  };
}